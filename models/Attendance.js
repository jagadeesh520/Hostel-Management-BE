// models/Attendance.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentName: { type: String, required: true },
  roomNo: { type: String, required: true },
  rollNo: { type: String, required: true },
  blockName: { type: String },

  status: { type: String, enum: ['Present', 'Absent'], required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD"

  // NEW — distinguish approved-leave absences
  isApprovedLeave: { type: Boolean, default: false },

  // Optional metadata
  leaveId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveApplication' },
  leaveType: String,
  leaveReason: String,

  timestamp: Date,
}, { timestamps: true });

attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
