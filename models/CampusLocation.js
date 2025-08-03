// models/CampusLocation.js
const mongoose = require("mongoose");

const campusLocationSchema = new mongoose.Schema({
  collegeName: {
    type: String,
    required: true,
    unique: true,
  },
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  radius: {
    type: Number,
    required: true, // in meters
    default: 100,
  },
}, { timestamps: true });

module.exports = mongoose.model('CampusLocation', campusLocationSchema);
