// models/TVContent.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const TVContentSchema = new Schema(
  {
    contentType: {
      type: String,
      enum: ["timetable", "menu", "foodImage", "video", "notification"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    mediaUrl: {
      type: String,
      required: function() {
        // mediaUrl is required for all content types except notifications
        return this.contentType !== 'notification';
      },
      default: null,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snacks"],
      default: null,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    displayDuration: {
      type: Number,
      default: 10, // seconds
      min: 3,
      max: 300,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    hostelId: {
      type: Schema.Types.ObjectId,
      ref: "Hostel",
      default: null,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Notification-specific fields
    notificationType: {
      type: String,
      enum: ["gate", "exam", "event", "announcement", "alert"],
      default: null,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    description: {
      type: String,
      default: null,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false, // Made optional for local testing
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
TVContentSchema.index({ isActive: 1, displayOrder: 1 });
TVContentSchema.index({ scheduledStart: 1, scheduledEnd: 1 });
TVContentSchema.index({ hostelId: 1, contentType: 1 });

module.exports = model("TVContent", TVContentSchema);

