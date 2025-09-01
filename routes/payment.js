const express = require("express");
const router = express.Router();
const MessLedger = require("../models/MessLedger");
const EstLedger = require("../models/EstLedger");
const Payment = require("../models/Payment");

/**
 * 1) INITIATE PAYMENT
 * Called by frontend before redirecting to BillDesk
 */
router.post("/initiate", async (req, res) => {
  try {
    const { rollNo, feeType, amount } = req.body;
    if (!rollNo || !feeType || !amount) {
      return res.status(400).json({ success: false, error: "Missing params" });
    }

    const orderId = "ORD" + Date.now();
    const txnId = "TXN" + Date.now();

    // Insert into payments collection
    await Payment.create({
      rollNo,
      feeType,
      amount,
      orderId,
      txnId,
      status: "SUCCESS", // dummy success
      createdAt: new Date(),
      paidAt: new Date(),
    });

    // Update respective ledger immediately
    if (feeType === "mess") {
      await MessLedger.updateOne(
        { rollNo },
        {
          $inc: { paid: amount * 1, overdue: -(amount * 1) },
          $set: { updatedAt: new Date() },
        }
      );
    } else if (feeType === "establishment") {
      await EstLedger.updateOne(
        { rollNo },
        {
          $inc: { paid: amount * 1, overdue: -(amount * 1) },
          $set: { updatedAt: new Date() },
        }
      );
    }

    // Respond to frontend
    res.json({
      success: true,
      orderId,
      txnId,
      message: "Dummy payment success. Ledger updated.",
    });
  } catch (err) {
    console.error("Payment initiate error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2) BILLDESK WEBHOOK FOR MESS PAYMENTS
 */
router.post("/messBill", async (req, res) => {
  try {
    const { rollNo, txnId, amount, status, orderId } = req.body;

    if (!rollNo || !txnId || !amount) {
      return res.status(400).json({ success: false, error: "Invalid payload" });
    }

    if (status === "SUCCESS") {
      await MessLedger.updateOne(
        { rollNo },
        { $inc: { paid: amount * 1, overdue: -(amount * 1) } }
      );
    }

    // Update existing Payment (if created during initiate), else create new
    await Payment.findOneAndUpdate(
      { orderId: orderId || null, rollNo, feeType: "mess" },
      {
        txnId,
        amount,
        status,
        paidAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Mess webhook error:", err);
    res.status(500).json({ success: false });
  }
});

/**
 * 3) BILLDESK WEBHOOK FOR ESTABLISHMENT PAYMENTS
 */
router.post("/establishmentBill", async (req, res) => {
  try {
    const { rollNo, txnId, amount, status, orderId } = req.body;

    if (!rollNo || !txnId || !amount) {
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
      {
        txnId,
        amount,
        status,
        paidAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Est webhook error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
