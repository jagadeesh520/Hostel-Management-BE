// models/Appreciation.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const AppreciationSchema = new Schema({
  achievementId: { type: Schema.Types.ObjectId, ref: "Achievement", required: true },
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  createdAt: { type: Date, default: Date.now }
});

// compound unique index prevents duplicates (one student per achievement)
AppreciationSchema.index({ achievementId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("Appreciation", AppreciationSchema);
