const mongoose = require('mongoose');

const timesheetSchema = new mongoose.Schema({
  studentId: String,
  studentName: String,
  roomNo: String,
  rollNo: String,
  status: String, // "Present" or "Absent"
  date: Date,
});

module.exports = mongoose.model('Timesheet', timesheetSchema);
