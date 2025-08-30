// models/BlockRule.js
const mongoose = require("mongoose");

const blockRuleSchema = new mongoose.Schema({
  gender: { type: String, enum: ["Male", "Female"], required: true },
  year: { type: String, required: true }, // "1st Year", "2nd Year", etc
  blockName: { type: String, required: true }, // must match a Hostel block
});

module.exports = mongoose.model("BlockRule", blockRuleSchema);
