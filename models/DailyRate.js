const mongoose = require("mongoose");

/**
 * IMPORTANT: Use 1..12 for month in the DB to match the frontend.
 * If you already have data saved as 0..11, see the GET /rate below
 * which will read both 0-based and 1-based while you migrate.
 */
const DailyRateSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true }, // prefer 1..12 going forward
    year: { type: Number, required: true },

    // OLD fields (kept for backward compat; optional now)
    boysRate: { type: Number, default: 0 },
    girlsRate: { type: Number, default: 0 },
    boysTotal: { type: Number, default: 0 },
    girlsTotal: { type: Number, default: 0 },

    // NEW: split by diet & gender (per-day rates)
    boysVegRate: { type: Number, default: 0 },
    boysNonVegRate: { type: Number, default: 0 },
    girlsVegRate: { type: Number, default: 0 },
    girlsNonVegRate: { type: Number, default: 0 },

    // NEW: Establishment charges (per month) by academic year
    estCharges: {
      y1: { type: Number, default: 0 },
      y2: { type: Number, default: 0 },
      y3: { type: Number, default: 0 },
      y4: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// One record per (month, year)
DailyRateSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("DailyRate", DailyRateSchema);
