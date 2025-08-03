// models/Warden.js
const mongoose = require("mongoose");

const wardenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  block: {
    type: String,
    required: true,
  },
  hostelType: {
    type: String,
    enum: ["Boys", "Girls"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Warden", wardenSchema);
