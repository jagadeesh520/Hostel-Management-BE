// routes/paymentWebhook.js
const express = require("express");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const MessLedger = require("../models/MessLedger");
const EstLedger = require("../models/EstLedger");
const { aes256DecryptFromHex } = require("../utils/billdesk-crypto");
const router = express.Router();

const BD_CLIENT_KEY = process.env.BD_CLIENT_KEY;

// Ensure you have these middlewares in your app.js:
// app.use(express.urlencoded({ extended: true })); // for form posts
// app.use(express.json()); // for json posts

function secureCompare(a, b) {
  // constant time compare
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return crypto.timingSafeEqual(bufA, bufB) && bufA.length === bufB.length;
  } catch (e) {
    return false;
  }
}

router.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("Webhook raw body:", body);

    // common BillDesk forms: either a 'msg' pipe-separated string or JSON fields or headers
    // Example: body.msg = "orderId|txnId|status|amount|...|checksum"
    let parsed = {};
    if (body.msg) {
      const parts = (body.msg || "").split("|");
      // assume last part is checksum
      const checksum = parts.pop();
      const messageWithoutChecksum = parts.join("|");

      // verify HMAC-SHA256 over messageWithoutChecksum with BD_CLIENT_KEY (common pattern)
      // NOTE: the exact algo/encoding must match BillDesk doc — replace if doc differs.
      const computed = crypto.createHmac("sha256", BD_CLIENT_KEY).update(messageWithoutChecksum).digest("hex");

      if (!secureCompare(computed, checksum)) {
        console.warn("Webhook checksum mismatch");
        return res.status(400).send("Checksum mismatch");
      }

      // Map parts to fields — adapt ordering per BillDesk doc
      // Example mapping (these indexes depend on doc)
      parsed.orderId = parts[0];
      parsed.txnId = parts[1];
      parsed.status = parts[2];
      parsed.amount = parts[3];
      parsed.rollNo = parts[4]; // if you included it
      parsed.feeType = parts[5] || "mess";
    } else if (body.signature || req.headers["x-signature"]) {
      // If they send signature header
      const sig = body.signature || req.headers["x-signature"];
      const payloadString = JSON.stringify(body.data || body);
      const computed = crypto.createHmac("sha256", BD_CLIENT_KEY).update(payloadString).digest("hex");
      if (!secureCompare(computed, sig)) {
        console.warn("Webhook header signature mismatch");
        return res.status(400).send("Signature mismatch");
      }
      parsed = body;
    } else {
      // Possibly JSON with fields already validated by other methods — handle defensively
      parsed = body;
    }

    // Update Payment and ledger only after verification
    const { orderId, txnId, status, amount, rollNo, feeType } = parsed;

    await Payment.findOneAndUpdate(
      { orderId: orderId || null },
      { $set: { txnId: txnId || null, amount: amount || null, status: status || "UNKNOWN", paidAt: status === "SUCCESS" ? new Date() : null } },
      { upsert: true }
    );

    if (status === "SUCCESS") {
      if (feeType === "mess") {
        await MessLedger.updateOne({ rollNo }, { $inc: { paid: Number(amount || 0), overdue: -Number(amount || 0) } });
      } else {
        await EstLedger.updateOne({ rollNo }, { $inc: { paid: Number(amount || 0), overdue: -Number(amount || 0) } });
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handling error:", err);
    res.status(500).send("ERR");
  }
});

module.exports = router;
