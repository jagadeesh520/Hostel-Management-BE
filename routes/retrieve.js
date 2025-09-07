// routes/retrieve.js
const express = require("express");
const axios = require("axios");
const { buildJwsHmac } = require("../utils/billdesk-crypto");
const router = express.Router();

const BD_RETRIEVE_URL = process.env.BD_RETRIEVE_URL; // default set earlier
const BD_CLIENT_ID = process.env.BD_CLIENT_ID;
const BD_CLIENT_KEY = process.env.BD_CLIENT_KEY;
const BD_MERCHANT_ID = process.env.BD_MERCHANT_ID;

router.post("/retrieve", async (req, res) => {
  try {
    const { bdorderid } = req.body;
    if (!bdorderid) return res.status(400).json({ success: false, error: "bdorderid required" });

    const payload = { bdorderid, merchantId: BD_MERCHANT_ID };
    const jws = buildJwsHmac({ alg: "HS256", clientid: BD_CLIENT_ID }, payload, BD_CLIENT_KEY);

    const resp = await axios.post(BD_RETRIEVE_URL, payload, {
      headers: { Authorization: `JWS ${jws}`, "Content-Type": "application/json" },
    });

    return res.json({ success: true, data: resp.data });
  } catch (err) {
    console.error("RetrieveTx error", err.response?.data || err.message);
    return res.status(500).json({ success: false, error: "Retrieve failed" });
  }
});

module.exports = router;
