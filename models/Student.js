const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  collegeName: { type: String, required: true },
  studentName: { type: String, required: true },
  gender: String,
  rollNo: { type: String, required: true, unique: true },
  year: String,
  roomNo: String,
  blockName: String,
  address: String,
  studentPhone: String,
  parentPhone: String,
  faceImage: {
    type: String,
    default: ""
  },
  faceImages: [String], // array of additional face image paths
  isCompleted: {
    type: Boolean,
    default: false
  },

  /** 👇 NEW field: veg or non-veg */
  type: {
    type: String,
    enum: ["veg", "non-veg"],  // restricts values
    required: true,            // enforce it must be set
  },

}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
