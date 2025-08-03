const mongoose = require("mongoose");

const DailyRateSchema = new mongoose.Schema({
  month: { type: Number, required: true }, // 0 = Jan, 11 = Dec
  year: { type: Number, required: true },
  boysRate: { type: Number, required: true },
  girlsRate: { type: Number, required: true },
  boysTotal: { type: Number, default: 0 },
  girlsTotal: { type: Number, default: 0 },
}, { timestamps: true });

// Ensure one record per month-year
DailyRateSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("DailyRate", DailyRateSchema);
