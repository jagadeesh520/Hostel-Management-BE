// models/TVContentAnalytics.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const TVContentAnalyticsSchema = new Schema(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: "TVContent",
      required: true,
    },
    tvDisplayId: {
      type: String,
      required: true,
      trim: true,
    },
    hostelId: {
      type: Schema.Types.ObjectId,
      ref: "Hostel",
      default: null,
    },
    viewCount: {
      type: Number,
      default: 1,
    },
    lastDisplayed: {
      type: Date,
      default: Date.now,
    },
    totalDisplayTime: {
      type: Number,
      default: 0, // seconds
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for daily aggregation
TVContentAnalyticsSchema.index({ contentId: 1, date: 1, tvDisplayId: 1 }, { unique: true });
TVContentAnalyticsSchema.index({ hostelId: 1, date: 1 });
TVContentAnalyticsSchema.index({ date: -1 });

module.exports = model("TVContentAnalytics", TVContentAnalyticsSchema);

