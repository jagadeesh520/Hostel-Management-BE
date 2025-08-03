const mongoose = require('mongoose');

const IssueTicketSchema = new mongoose.Schema({
  issueType: { type: String, required: true },
  description: { type: String, required: true },
  rollNo: { type: String, required: true },
  imagePath: { type: String },
  status: { type: String, default: 'Pending' },
  resolutionImage: { type: String },
  resolutionNote: { type: String },
  resolvedAt: { type: Date },
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

module.exports = mongoose.model('IssueTicket', IssueTicketSchema);
