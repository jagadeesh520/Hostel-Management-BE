// models/StudentDue.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentLogSub = new mongoose.Schema({
  challanId: { type: Schema.Types.ObjectId, ref: 'Challan' },
  refNo: { type: String },
  createdAt: { type: Date, default: Date.now },
  appliedAt: { type: Date },

  // statuses now include billing/reversal entries as well
  status: { type: String, enum: ['pending', 'applied', 'failed', 'billed', 'reversed'], default: 'pending' },

  // snapshots BEFORE applying (Est, Mess)
  beforeEstDue: { type: Number, default: 0 },
  beforeMessDue: { type: Number, default: 0 },

  // challan / raw amount
  amount: { type: Number, default: 0 },

  // how much was applied to each bucket (payments)
  amtPaidEst: { type: Number, default: 0 },
  amtPaidMess: { type: Number, default: 0 },

  // for billing entries: how much was billed (new fields, optional)
  amtBilledEst: { type: Number, default: 0 },
  amtBilledMess: { type: Number, default: 0 },

  // snapshot after apply (total due)
  afterTotalDue: { type: Number, default: 0 },

  studentName: { type: String, default: '' },
  note: { type: String, default: '' },

  // optional month/year for billed entries
  month: { type: Number }, // 1..12
  year: { type: Number }
}, { _id: true });

const StudentDueSchema = new mongoose.Schema({
  rollNo: { type: String, required: true, unique: true, index: true },
  studentName: { type: String, default: '' },

  // current remaining dues (what payments will reduce)
  messDue: { type: Number, default: 0 },
  estDue: { type: Number, default: 0 },

  // computed from messDue + estDue
  totalDue: { type: Number, default: 0 },

  // optional: track overpayment/credit
  credit: { type: Number, default: 0 },

  lastUploadBy: { type: String },
  lastUploadAt: { type: Date },

  // last billed month for idempotency { month, year } (null if never billed)
  lastBilledMonth: {
    month: { type: Number },
    year: { type: Number }
  },

  // keep refs to MonthlyBill docs (optional, useful for reconciliation)
  monthlyBills: [{ type: Schema.Types.ObjectId, ref: 'MonthlyBill' }],

  // payment log history (includes applied payments and billing entries)
  paymentLogs: { type: [PaymentLogSub], default: [] }
}, { timestamps: true });

// normalize rollNo before save
StudentDueSchema.pre('save', function (next) {
  if (this.rollNo) this.rollNo = String(this.rollNo).trim().toUpperCase();
  next();
});

module.exports = mongoose.model('StudentDue', StudentDueSchema);
