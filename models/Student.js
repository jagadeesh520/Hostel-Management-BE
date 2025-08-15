const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  collegeName: { type: String, required: true },
  studentName: { type: String, required: true },
  gender: String,
  rollNo: { type: String, required: true, unique: true },
  year: String,
  roomNo: String,
  blockName: String,
  address: String,           // ✅ New field
  studentPhone: String,      // ✅ New field
  parentPhone: String,       // ✅ New field
  faceImage: {
    type: String,
    default: ""
  },
  faceImages: [String], // array of additional face image paths
  isCompleted: {
    type: Boolean,
    default: false
  },
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
