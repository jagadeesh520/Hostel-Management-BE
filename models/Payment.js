// models/Payment.js
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  rollNo: { type: String, required: true },
  feeType: { type: String, enum: ["mess", "establishment"], required: true },
  amount: { type: Number, required: true },
  orderId: { type: String, unique: true },   // ✅ each initiate creates unique order
  txnId: { type: String },
  status: { type: String, enum: ["initiated", "SUCCESS", "FAILED"], default: "initiated" },
  month: { type: Number },   // optional
  year: { type: Number },    // optional
  paymentMethod: { type: String },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Payment", paymentSchema);
