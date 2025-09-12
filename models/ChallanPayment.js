// models/Payment.js
const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    rollNo: { type: String, required: true },
    refNo: { type: String },
    category: { type: String }, // "MESS FEE" or "FEES"
    amount: { type: String, required: true }, // stored as string from challan
    status: { type: String, default: "pending" },
    approvedAt: { type: Date },
    appliedToDues: { type: Boolean, default: false },
    appliedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);
