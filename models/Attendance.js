const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, required: true },
  roomNo: { type: String, required: true },
  rollNo: { type: String, required: true},
  blockName: {
  type: String,
  required: false, // or true if needed
},
  status: { type: String, enum: ['Present', 'Absent'], required: true },
  date: { type: String, required: true }, // Use String "YYYY-MM-DD" for consistency
});

module.exports = mongoose.model('Attendance', attendanceSchema);
