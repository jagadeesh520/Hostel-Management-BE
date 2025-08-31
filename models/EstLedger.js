// models/EstLedger.js
const mongoose = require("mongoose");

const estLedgerSchema = new mongoose.Schema({
  rollNo: { type: String, required: true },
  overdue: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EstLedger", estLedgerSchema);
