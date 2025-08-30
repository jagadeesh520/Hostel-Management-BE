// models/IssueTicket.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const IssueTicketSchema = new Schema(
  {
    issueType: String,
    description: String,
    rollNo: String,
    studentName: String,
    roomNo: String,
    imagePath: String,

    // Status flow: Pending -> Assigned -> WardenFixed -> Resolved
    status: {
      type: String,
      enum: ["Pending", "Assigned", "WardenFixed", "Resolved"],
      default: "Pending",
    },

    // Assignment
    assignedWarden: { type: Schema.Types.ObjectId, ref: "Warden" },
    assignedAt: Date,

    // Warden fix
    wardenReply: String,
    resolutionImage: String,   // filename for proof image (already in your docs)
    wardenFixedAt: Date,

    // Admin final resolve
    resolvedAt: Date,
  },
  { timestamps: true }
);

module.exports = model("IssueTicket", IssueTicketSchema);
