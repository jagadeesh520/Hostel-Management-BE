const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const {
  buildJwsHmac,
  aes256EncryptToHex,
} = require("../utils/billdesk-crypto");
const router = express.Router();
const MessLedger = require("../models/MessLedger");
const EstLedger = require("../models/EstLedger");
const Payment = require("../models/Payment");

// Trim and normalize envs
const BD_MERCHANT_ID =
  process.env.BD_MERCHANT_ID && process.env.BD_MERCHANT_ID.trim();
const BD_CLIENT_ID =
  process.env.BD_CLIENT_ID && process.env.BD_CLIENT_ID.trim();
const BD_CLIENT_KEY =
  process.env.BD_CLIENT_KEY && process.env.BD_CLIENT_KEY.trim(); // Signing Password (HMAC secret)
const BD_KEY_ID = process.env.BD_KEY_ID && process.env.BD_KEY_ID.trim(); // optional Key ID
const BD_ENC_KEY = process.env.BD_ENC_KEY && process.env.BD_ENC_KEY.trim();
const BD_ENC_IV = process.env.BD_ENC_IV && process.env.BD_ENC_IV.trim();
const RAW_BD_CREATE_ORDER_URL = process.env.BD_CREATE_ORDER_URL;
const BD_CREATE_ORDER_URL = RAW_BD_CREATE_ORDER_URL
  ? RAW_BD_CREATE_ORDER_URL.trim()
  : RAW_BD_CREATE_ORDER_URL;
const BD_RETURN_URL =
  process.env.BD_RETURN_URL && process.env.BD_RETURN_URL.trim();
const BD_CALLBACK_URL =
  process.env.BD_CALLBACK_URL && process.env.BD_CALLBACK_URL.trim();

// Helpers
function isValidHttpUrl(string) {
  try {
    const u = new URL(string);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function secureCompare(a, b) {
  try {
    const A = Buffer.from(String(a));
    const B = Buffer.from(String(b));
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch {
    return false;
  }
}

function getEnvProblems() {
  const problems = [];
  if (!BD_MERCHANT_ID) problems.push("BD_MERCHANT_ID missing");
  if (!BD_CLIENT_ID) problems.push("BD_CLIENT_ID missing");
  if (!BD_CLIENT_KEY)
    problems.push("BD_CLIENT_KEY missing (must be Signing Password)");
  if (!BD_CREATE_ORDER_URL) problems.push("BD_CREATE_ORDER_URL missing");
  else if (!isValidHttpUrl(BD_CREATE_ORDER_URL))
    problems.push(`BD_CREATE_ORDER_URL invalid: "${BD_CREATE_ORDER_URL}"`);
  if (BD_ENC_KEY && BD_ENC_KEY.includes("REPLACE_32_BYTE"))
    problems.push("BD_ENC_KEY placeholder");
  if (BD_ENC_IV && BD_ENC_IV.includes("REPLACE_16_BYTE"))
    problems.push("BD_ENC_IV placeholder");
  return problems;
}

const envProblems = getEnvProblems();
if (envProblems.length) {
  console.error("BillDesk env problems:", envProblems);
}

// Trace id + IST timestamp helpers
function genTraceId() {
  const t = Date.now().toString().slice(-10); // 10 digits
  const r = Math.floor(Math.random() * 9000 + 1000); // 4 digits
  return `ORD${t}${r}`; // between 14.. and under 35 chars
}

function istTimestamp() {
  const d = new Date();
  // compute IST by adding 5.5 hours to UTC
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getFullYear()}${pad(ist.getMonth() + 1)}${pad(
    ist.getDate()
  )}${pad(ist.getHours())}${pad(ist.getMinutes())}${pad(ist.getSeconds())}`;
}

function isoWithISTOffset(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}+05:30`;
}

/**
 * Build rdata payload.
 * If BD_ENC_KEY/IV exist we encrypt JSON to hex (aes-256-cbc).
 * If not configured, we fallback to returning plain JSON string (dev only).
 */
function buildRdata(payload) {
  const plain = JSON.stringify(payload);
  if (
    !BD_ENC_KEY ||
    !BD_ENC_IV ||
    BD_ENC_KEY.includes("REPLACE") ||
    BD_ENC_IV.includes("REPLACE")
  ) {
    return plain;
  }
  return aes256EncryptToHex(plain, BD_ENC_KEY, BD_ENC_IV);
}

/**
 * CREATE ORDER - Initiate payment with BillDesk (V2)
 */
router.post("/initiate", async (req, res) => {
  try {
    if (envProblems.length) {
      return res.status(500).json({
        success: false,
        error:
          "Server misconfigured for BillDesk. See server logs for missing env variables.",
        missing: envProblems,
      });
    }

    const { rollNo, feeType, amount } = req.body;
    if (!rollNo || !feeType || !amount) {
      return res.status(400).json({ success: false, error: "Missing params" });
    }

    const merchantOrderId = "ORD" + Date.now();
    const internalTxn = "TXN" + Date.now();

    await Payment.create({
      rollNo,
      feeType,
      amount,
      orderId: merchantOrderId,
      txnId: internalTxn,
      status: "initiated",
      createdAt: new Date(),
    });

    // BillDesk expects snake_case keys per doc
    const createOrderPayload = {
      orderid: merchantOrderId,
      mercid: BD_MERCHANT_ID,
      order_date: isoWithISTOffset(),
      amount: String(amount),
      currency: "356", // keep numeric if doc expects it
      ru: BD_RETURN_URL,
      itemcode: feeType === "mess" ? "MESS" : "EST",
      customerid: rollNo,
    };

    // JWS header (HMAC-SHA256). include kid only if provided
    const jwsHeader = { alg: "HS256", clientid: BD_CLIENT_ID };
    if (BD_KEY_ID) jwsHeader.kid = BD_KEY_ID;

    // Build JWS token using BD_CLIENT_KEY (Signing Password) -- ensure it's trimmed
    const jwsToken = buildJwsHmac(jwsHeader, createOrderPayload, BD_CLIENT_KEY);

    // --- DEBUG: decode and verify locally (will not log secret) ---
    try {
      const parts = (jwsToken || "").split(".");
      if (parts.length === 3) {
        const [hdrB64, payloadB64, sigB64] = parts;
        const base64urlToBuffer = (s) => {
          s = s.replace(/-/g, "+").replace(/_/g, "/");
          const pad = s.length % 4;
          if (pad === 2) s += "==";
          else if (pad === 3) s += "=";
          else if (pad === 1) s += "===";
          return Buffer.from(s, "base64");
        };
        const b64uDecodeToStr = (s) => base64urlToBuffer(s).toString("utf8");
        const decodedHeader = b64uDecodeToStr(hdrB64);
        const decodedPayload = b64uDecodeToStr(payloadB64);
        console.log("JWS decoded header:", decodedHeader);
        console.log("JWS decoded payload:", decodedPayload);
        // recompute
        const signingInput = `${hdrB64}.${payloadB64}`;
        const computedSig = crypto
          .createHmac("sha256", String(BD_CLIENT_KEY))
          .update(signingInput)
          .digest();
        const computedSigB64 = computedSig
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        console.log(
          "JWS token signature (from token) prefix:",
          sigB64.slice(0, 40) + "..."
        );
        console.log(
          "JWS recomputed signature prefix     :",
          computedSigB64.slice(0, 40) + "..."
        );
        console.log("Signature match?:", computedSigB64 === sigB64);
      } else {
        console.warn("JWS token does not contain 3 parts");
      }
    } catch (e) {
      console.error("JWS debug helper failed:", e);
    }

    if (!BD_CREATE_ORDER_URL || !isValidHttpUrl(BD_CREATE_ORDER_URL)) {
      console.error(
        "CreateOrder aborted - BD_CREATE_ORDER_URL invalid:",
        BD_CREATE_ORDER_URL
      );
      return res
        .status(500)
        .json({
          success: false,
          error: "Invalid BD_CREATE_ORDER_URL. Check server logs.",
        });
    }

    // call BillDesk with required headers
    let bdResp;
    try {
      const traceid = genTraceId();
      const timestamp = istTimestamp();
      const headers = {
        Accept: "application/jose",
        "Content-Type": "application/json",
        "BD-Traceid": traceid,
        "BD-Timestamp": timestamp,
      };

      console.log("Calling BillDesk CreateOrder:", {
        url: BD_CREATE_ORDER_URL,
        orderid: merchantOrderId,
        traceid,
        timestamp,
        payload: createOrderPayload,
      });

      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          bdResp = await axios.post(BD_CREATE_ORDER_URL, jwsToken, {
            headers,
            timeout: 20000,
          });
          break; // success
        } catch (err) {
          const status = err.response?.status;
          if (attempt === maxRetries || status !== 500) throw err;
          console.warn(
            `Retrying CreateOrder (attempt ${attempt}) due to 500 error...`
          );
          await new Promise((res) => setTimeout(res, 1000 * attempt)); // exponential backoff
        }
      }
    } catch (err) {
      console.error("CreateOrder error calling BillDesk:", {
        url: BD_CREATE_ORDER_URL,
        code: err.code || null,
        message: err.message,
        isAxiosError: err.isAxiosError || false,
        status: err.response?.status || null,
        responseData: err.response?.data || null,
      });
      return res.status(500).json({
        success: false,
        error: "CreateOrder failed (see server logs).",
        details: {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          responseData: err.response?.data,
        },
      });
    }

    const data = bdResp.data || {};
    const bdorderid =
      data.bdorderid || data.bdOrderId || data.orderid || data.bd_order_id;
    const merchantid = data.merchantid || data.mercid || data.merchantId;
    let rdata = data.rdata || data.rData || data.authToken || data.token;
    if (!rdata) {
      rdata = buildRdata({
        orderid: merchantOrderId,
        amount: String(amount),
        currency: "356",
        ru: BD_RETURN_URL,
        callbackUrl: BD_CALLBACK_URL,
        customerid: rollNo,
      });
    }

    await Payment.findOneAndUpdate(
      { orderId: merchantOrderId },
      { $set: { bdorderid, merchantid, rdata } }
    );

    return res.json({
      success: true,
      bdorderid,
      merchantid,
      rdata,
      orderId: merchantOrderId,
      txnId: internalTxn,
    });
  } catch (outerErr) {
    console.error("Unexpected error in /initiate:", outerErr);
    return res
      .status(500)
      .json({
        success: false,
        error: "Server error",
        details: outerErr.message || outerErr,
      });
  }
});
/**
 * BILLDESK WEBHOOK FOR MESS PAYMENTS
 *
 * Note: BillDesk may post a single 'msg' pipe-separated string or JSON fields.
 * This handler attempts basic verification if body.msg is present and BD_CLIENT_KEY is set.
 * Adjust the parsing and checksum verification exactly per BillDesk's UAT payload format.
 */
router.post("/messBill", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("messBill webhook received:", body);

    // If body has 'msg' field of the form "field1|field2|...|checksum", attempt to verify
    if (body.msg && BD_CLIENT_KEY && !BD_CLIENT_KEY.includes("REPLACE_WITH")) {
      const parts = String(body.msg).split("|");
      const checksum = parts.pop();
      const message = parts.join("|");

      // Using HMAC-SHA256 hex (common) — change if BillDesk uses a different algorithm/encoding
      const computed = crypto
        .createHmac("sha256", BD_CLIENT_KEY)
        .update(message)
        .digest("hex");
      if (!secureCompare(computed, checksum)) {
        console.warn("messBill webhook checksum mismatch", {
          computed,
          checksum,
        });
        return res
          .status(400)
          .json({ success: false, error: "Checksum mismatch" });
      }

      // Map parts to fields according to your BillDesk msg order.
      // IMPORTANT: adapt indexes below to match BillDesk docs.
      const maybe = {
        bdorderid: parts[0],
        txnId: parts[1],
        status: parts[2],
        amount: parts[3],
        // if you included customerid/custom fields in create order, parse them accordingly
      };

      // Update Payment by bdorderid
      await Payment.findOneAndUpdate(
        { bdorderid: maybe.bdorderid },
        {
          $set: {
            txnId: maybe.txnId,
            amount: maybe.amount,
            status: maybe.status,
            paidAt: maybe.status === "SUCCESS" ? new Date() : null,
          },
        },
        { upsert: true, new: true }
      );

      // Update ledger if SUCCESS: lookup rollNo from Payment record
      if (maybe.status === "SUCCESS") {
        const payment = await Payment.findOne({ bdorderid: maybe.bdorderid });
        if (payment) {
          const rollNo = payment.rollNo;
          const amt = Number(maybe.amount || payment.amount || 0);
          if (payment.feeType === "mess") {
            await MessLedger.updateOne(
              { rollNo },
              { $inc: { paid: amt, overdue: -amt } }
            );
          } else {
            await EstLedger.updateOne(
              { rollNo },
              { $inc: { paid: amt, overdue: -amt } }
            );
          }
        }
      }

      return res.status(200).json({ success: true });
    }

    // Fallback: legacy JSON payload expected by your original code
    const { rollNo, txnId, amount, status, orderId } = body;
    if (!rollNo || !txnId || !amount) {
      console.warn("messBill invalid payload:", body);
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    if (status === "SUCCESS") {
      await MessLedger.updateOne(
        { rollNo },
        { $inc: { paid: amount * 1, overdue: -(amount * 1) } }
      );
    }

    await Payment.findOneAndUpdate(
      { orderId: orderId || null, rollNo, feeType: "mess" },
      { txnId, amount, status, paidAt: new Date() },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Mess webhook error:", err);
    return res.status(500).json({ success: false });
  }
});

/**
 * BILLDESK WEBHOOK FOR ESTABLISHMENT PAYMENTS
 * Similar handling to messBill above.
 */
router.post("/establishmentBill", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("establishmentBill webhook received:", body);

    // Attempt 'msg' style parsing if present
    if (body.msg && BD_CLIENT_KEY && !BD_CLIENT_KEY.includes("REPLACE_WITH")) {
      const parts = String(body.msg).split("|");
      const checksum = parts.pop();
      const message = parts.join("|");
      const computed = crypto
        .createHmac("sha256", BD_CLIENT_KEY)
        .update(message)
        .digest("hex");
      if (!secureCompare(computed, checksum)) {
        console.warn("establishmentBill checksum mismatch", {
          computed,
          checksum,
        });
        return res
          .status(400)
          .json({ success: false, error: "Checksum mismatch" });
      }

      const maybe = {
        bdorderid: parts[0],
        txnId: parts[1],
        status: parts[2],
        amount: parts[3],
      };

      await Payment.findOneAndUpdate(
        { bdorderid: maybe.bdorderid },
        {
          $set: {
            txnId: maybe.txnId,
            amount: maybe.amount,
            status: maybe.status,
            paidAt: maybe.status === "SUCCESS" ? new Date() : null,
          },
        },
        { upsert: true, new: true }
      );

      if (maybe.status === "SUCCESS") {
        const payment = await Payment.findOne({ bdorderid: maybe.bdorderid });
        if (payment) {
          const rollNo = payment.rollNo;
          const amt = Number(maybe.amount || payment.amount || 0);
          if (payment.feeType === "establishment") {
            await EstLedger.updateOne(
              { rollNo },
              { $inc: { paid: amt, overdue: -amt } }
            );
          } else {
            await MessLedger.updateOne(
              { rollNo },
              { $inc: { paid: amt, overdue: -amt } }
            );
          }
        }
      }

      return res.status(200).json({ success: true });
    }

    // Fallback: original expected JSON fields
    const { rollNo, txnId, amount, status, orderId } = body;
    if (!rollNo || !txnId || !amount) {
      console.warn("establishmentBill invalid payload:", body);
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    if (status === "SUCCESS") {
      await EstLedger.updateOne(
        { rollNo },
        { $inc: { paid: amount * 1, overdue: -(amount * 1) } }
      );
    }

    await Payment.findOneAndUpdate(
      { orderId: orderId || null, rollNo, feeType: "establishment" },
      { txnId, amount, status, paidAt: new Date() },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Est webhook error:", err);
    return res.status(500).json({ success: false });
  }
});

// Simple user redirect target (webview/browser will hit this after payment)
router.get("/response", (req, res) => {
  // BillDesk may POST to RU; they also redirect the browser with query string / form POST.
  // Show a simple page or JSON for debugging.
  console.log(
    "Browser returned to return URL:",
    req.method,
    req.query,
    req.body
  );
  res.send(
    "<h2>Payment flow finished. Close this window and check the app.</h2>"
  );
});

// Webhook: BillDesk POSTs transaction result here
router.post("/webhook", async (req, res) => {
  console.log("BillDesk webhook received:", req.body);

  // TODO: verify signature/checksum here using BD_CLIENT_KEY (important)
  // Example minimal flow:
  try {
    // parse fields — adjust according to BillDesk payload (msg or JSON)
    const { orderid, bdorderid, txnId, status, amount, customerid } = req.body; // sample keys
    // update Payment record if exists
    await Payment.findOneAndUpdate(
      { bdorderid: bdorderid || orderid },
      {
        status: status || "UNKNOWN",
        txnId,
        amount,
        paidAt: status === "SUCCESS" ? new Date() : null,
      },
      { upsert: false }
    );
    // update ledgers if success (adapt to your schema)
    if (status === "SUCCESS" && customerid) {
      // determine feeType from Payment or include it in createOrder's custom fields
      // Example: MessLedger.updateOne({ rollNo: customerid }, { $inc: { paid: amount, overdue: -amount } });
    }
    res.status(200).json({ success: true });
  } catch (e) {
    console.error("Webhook handling error:", e);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
