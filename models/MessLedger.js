// models/MessLedger.js
const mongoose = require("mongoose");

const messLedgerSchema = new mongoose.Schema({
  rollNo: { type: String, required: true },
  overdue: { type: Number, default: 0 },   // pending dues
  paid: { type: Number, default: 0 },      // already paid
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("MessLedger", messLedgerSchema);
