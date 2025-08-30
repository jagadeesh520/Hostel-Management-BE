// models/Hostel.js
const mongoose = require("mongoose");

const bedSchema = new mongoose.Schema({
  bedNumber: Number,
  occupied: {
    type: Boolean,
    default: false
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    default: null
  }
});

const roomSchema = new mongoose.Schema({
  roomNumber: String,
  isBlocked: { type: Boolean, default: false },
  beds: [bedSchema]
});

const floorSchema = new mongoose.Schema({
  floorNumber: Number,
  rooms: [roomSchema]
});

const blockSchema = new mongoose.Schema({
  name: String,
  floors: [floorSchema]
});

const hostelSchema = new mongoose.Schema({
  type: { type: String, enum: ["Boys", "Girls"], required: true },
  blocks: [blockSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Hostel", hostelSchema);
