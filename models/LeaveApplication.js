const mongoose = require('mongoose');

const LeaveStatus = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const LeaveApplicationSchema = new mongoose.Schema(
  {
    // FIX: point to Student, not User
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',              // <-- was 'User'
      required: true,
      index: true
    },

    leaveType: { type: String, enum: ['casual', 'medical', 'emergency'], required: true },
    fromDate:  { type: Date, required: true },
    toDate:    { type: Date, required: true },
    numberOfDays: { type: Number, required: true }, // pre-validate will fill this

    reason: { type: String, trim: true, required: true },
    status: { type: String, enum: Object.values(LeaveStatus), default: LeaveStatus.PENDING, index: true },

    decision: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // ok to keep if wardens are in User collection
      at: { type: Date },
      comment: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

// Compute numberOfDays
LeaveApplicationSchema.pre('validate', function (next) {
  if (this.fromDate && this.toDate) {
    const start = new Date(this.fromDate); start.setHours(0,0,0,0);
    const end   = new Date(this.toDate);   end.setHours(0,0,0,0);
    if (end < start) return next(new Error('toDate cannot be before fromDate'));
    const diffMs = Math.abs(end - start);
    this.numberOfDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }
  next();
});

LeaveApplicationSchema.index({ status: 1, createdAt: -1 });
LeaveApplicationSchema.index({ student: 1, createdAt: -1 });

Object.assign(LeaveApplicationSchema.statics, { LeaveStatus });

module.exports = mongoose.model('LeaveApplication', LeaveApplicationSchema);
