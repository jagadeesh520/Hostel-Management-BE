const express = require("express");
const router = express.Router();
const MessLedger = require("../models/MessLedger");   // correct Ledger model
const MessPayment = require("../models/MessPayment"); // correct Payment model

// Record payment
router.post("/payments", async (req, res) => {
  try {
    const { rollNo, amount, paymentMethod } = req.body;

    // Save payment
    const doc = await MessPayment.create({
      rollNo,
      amount,
      paymentMethod,
      paidAt: new Date()
    });

    // Update ledger timestamp
    await MessLedger.updateOne(
      { rollNo },
      { $set: { updatedAt: new Date() } }
    );

    res.json({ success: true, payment: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get dues
router.get("/dues/:rollNo", async (req, res) => {
  try {
    const { rollNo } = req.params;
    console.log("Looking up dues for rollNo param:", JSON.stringify(rollNo));

    // Look up from MessLedger directly (manual entries)
    const ledger = await MessLedger.findOne({ rollNo: String(rollNo).trim() });
    console.log("Ledger found:", ledger);

    if (!ledger) {
      return res.json({ rollNo, overdue: 0, paid: 0 });
    }

    res.json({
      rollNo,
      overdue: ledger.overdue || 0,
      paid: ledger.paid || 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;
