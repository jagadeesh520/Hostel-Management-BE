const mongoose = require("mongoose");

const estPaymentSchema = new mongoose.Schema({
  rollNo: String,
  month: Number,
  year: Number,
  amount: Number,
  paymentMethod: String,
  paidAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EstPayment", estPaymentSchema);
