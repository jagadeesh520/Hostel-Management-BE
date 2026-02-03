// models/TVDisplayConfig.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const TVDisplayConfigSchema = new Schema(
  {
    hostelId: {
      type: Schema.Types.ObjectId,
      ref: "Hostel",
      required: true,
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    rotationSettings: {
      timetableEnabled: {
        type: Boolean,
        default: true,
      },
      timetableDuration: {
        type: Number,
        default: 15, // seconds
        min: 5,
        max: 60,
      },
      menuEnabled: {
        type: Boolean,
        default: true,
      },
      menuDuration: {
        type: Number,
        default: 20, // seconds
        min: 10,
        max: 60,
      },
      foodImagesEnabled: {
        type: Boolean,
        default: true,
      },
      foodImagesDuration: {
        type: Number,
        default: 10, // seconds per image
        min: 3,
        max: 30,
      },
      videosEnabled: {
        type: Boolean,
        default: true,
      },
      videoDuration: {
        type: Number,
        default: 60, // seconds (max video length)
        min: 10,
        max: 120,
      },
    },
    theme: {
      backgroundColor: {
        type: String,
        default: "#1a1a2e",
      },
      primaryColor: {
        type: String,
        default: "#6200ee",
      },
      fontFamily: {
        type: String,
        default: "Arial, sans-serif",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for hostel lookup
TVDisplayConfigSchema.index({ hostelId: 1 });

module.exports = model("TVDisplayConfig", TVDisplayConfigSchema);

