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

    // 1) Manual ledger record
    const ledger = await MessLedger.findOne({ rollNo });
    const openingOverdue = ledger?.overdue || 0;
    const openingPaid = ledger?.paid || 0;

    // 2) Payments recorded in system
    const paidFromSystem = await MessPayment.aggregate([
      { $match: { rollNo } },
      { $group: { _id: null, totalPaid: { $sum: "$amount" } } }
    ]);
    const paidAfterSystem = paidFromSystem[0]?.totalPaid || 0;

    // 3) Total paid = manual + system
    const totalPaid = openingPaid + paidAfterSystem;

    // 4) Due = opening overdue - total paid
    const due = openingOverdue - totalPaid;

    res.json({
      rollNo,
      overdue: openingOverdue,
      paid: totalPaid,
      due: due < 0 ? 0 : due // never negative
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
