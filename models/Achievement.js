// models/Achievement.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AchievementSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  rollNo: { type: String, required: true, index: true },
  studentName: { type: String },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, default: "Academic" },
  level: {
    type: String,
    enum: ["bronze", "silver", "gold", "platinum"],
    required: true,
  },
  awardedBy: { type: String, default: "Administration" },
  date: { type: Date, required: true },
  image: { type: String }, // stored path or URL
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Achievement", AchievementSchema);
