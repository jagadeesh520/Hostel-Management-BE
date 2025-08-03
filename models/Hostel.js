// models/Hostel.js
const mongoose = require("mongoose");

const hostelSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["Boys", "Girls"],
    required: true,
  },
  blocks: {
    type: [String],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Hostel", hostelSchema);
