// models/Challan.js
const mongoose = require('mongoose');

const ChallanSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: false }, // optional
  rollNo: { type: String, index: true, required: false }, // quick lookup by roll

  // canonical ref number extracted from the challan e.g. DUO2005395
  refNo: { type: String, required: true, index: true },

  // parsed fields container (store everything useful)
  fields: {
    refNo: String,
    category: String,
    amount: String,
    rollNo: String,
    studentName: String,
    fatherName: String,
    course: String,
    branch: String,
    yearOfStudy: String,
    mobile: String,
    email: String,
    monthlyMessFee: String,
    noOfMonths: String,
    transactionCharge: String,
  },

  // path where uploaded file is saved
  filePath: { type: String },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // who uploaded the challan in the system (if student auth exists)
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: false },

  // who approved it — now references HostelOffice user
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HostelOffice', required: false },

  approvedAt: { type: Date, required: false },

}, {
  timestamps: true, // adds createdAt and updatedAt
  versionKey: false
});

// Ensure unique constraint for refNo (create index if not already present).
// Important: if you had duplicates in DB this will fail; remove duplicates before enabling unique.
ChallanSchema.index({ refNo: 1 }, { unique: true, background: true });

// Useful compound index for common queries (by roll + status)
ChallanSchema.index({ rollNo: 1, status: 1 });

module.exports = mongoose.model('Challan', ChallanSchema);
