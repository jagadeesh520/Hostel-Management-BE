// routes/payments.js
const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const { applyApprovedPayment } = require('../utils/paymentUtils');

/**
 * POST /api/payments/:id/approve
 * - sets status=approved (if not already)
 * - calls applyApprovedPayment to update StudentDue
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const id = req.params.id;
    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    if (payment.status !== 'approved') {
      payment.status = 'approved';
      payment.approvedAt = new Date();
      await payment.save();
    }

    // apply to StudentDue (idempotent)
    const result = await applyApprovedPayment(payment._id);

    if (result.applied) {
      return res.json({ success: true, message: 'Payment applied to dues', studentDue: result.studentDue });
    } else {
      return res.json({ success: true, message: 'Payment not applied', reason: result.reason });
    }
  } catch (err) {
    console.error('Approve error:', err);
    return res.status(500).json({ error: (err && err.message) ? err.message : 'Internal server error' });
  }
});

module.exports = router;
