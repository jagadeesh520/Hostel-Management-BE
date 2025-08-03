const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  collegeName: String,
  studentName: String,
  gender: String,
  rollNo: String,
  year: String,
  roomNo: String,
  faceImage: {
    type: String,
    default: ""
  },
  faceImages: [String], // array of additional face image paths
  isCompleted: {
    type: Boolean,
    default: false
  },
  blockName: String,
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
