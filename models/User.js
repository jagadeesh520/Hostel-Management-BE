const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  rollNo: {
  type: String,
  required: false,
  unique: true,
  sparse: true  // ✅ Important to allow multiple null values
},
  role: {
    type: String,
    enum: ["Admin", "Warden", "Student"],
    default: "Student"
  }
});

module.exports = mongoose.model("User", userSchema);
