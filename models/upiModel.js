// models/upiModel.js
const mongoose = require("mongoose");

const upiSchema = new mongoose.Schema({
  upiId: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    default: "College Mess",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("UPI", upiSchema);
