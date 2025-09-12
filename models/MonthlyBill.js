// models/MonthlyBill.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MonthlyBillSchema = new Schema({
  rollNo: { type: String, required: true, index: true },
  studentName: { type: String, default: '' },

  // target month/year billed
  month: { type: Number, required: true }, // 1..12
  year: { type: Number, required: true },

  // computed amounts
  messBill: { type: Number, default: 0 },
  estBill: { type: Number, default: 0 },

  // details for audit/reconciliation
  presentDays: { type: Number, default: 0 },
  perDayRate: { type: Number, default: 0 },

  // bookkeeping
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['billed', 'paid', 'reversed'], default: 'billed' },
  appliedRef: { type: String, default: '' }, // challan/ref when paid
  appliedAt: { type: Date },

  note: { type: String, default: '' }
}, { timestamps: false });

// unique index to enforce idempotency per student-month
MonthlyBillSchema.index({ rollNo: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyBill', MonthlyBillSchema);
