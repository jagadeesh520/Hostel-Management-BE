const express = require("express");
const router = express.Router();
const EstLedger = require("../models/EstLedger");
const EstPayment = require("../models/EstPayment");  // FIXED

// Record payment
router.post("/payments", async (req, res) => {
  try {
    const { rollNo, amount, paymentMethod } = req.body;

    const doc = await EstPayment.create({
      rollNo,
      amount,
      paymentMethod,
      paidAt: new Date()
    });

    // Update ledger timestamp
    await EstLedger.updateOne(
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

    // Opening balance from manual ledger
    const ledger = await EstLedger.findOne({ rollNo });
    const openingOverdue = ledger?.overdue || 0;
    const openingPaid   = ledger?.paid || 0;

    // Payments logged in system
    const paidFromSystem = await EstPayment.aggregate([
      { $match: { rollNo } },
      { $group: { _id: null, totalPaid: { $sum: "$amount" } } }
    ]);
    const paidAfterSystem = paidFromSystem[0]?.totalPaid || 0;

    // Combine
    const totalPaid = openingPaid + paidAfterSystem;
    const due = openingOverdue - totalPaid;

    res.json({
      rollNo,
      overdue: openingOverdue,
      paid: totalPaid,
      due: due < 0 ? 0 : due
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
