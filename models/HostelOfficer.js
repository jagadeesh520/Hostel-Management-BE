const mongoose = require('mongoose');

const OfficerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String }, // optional
  role: { type: String, default: 'officer' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Officer', OfficerSchema);
