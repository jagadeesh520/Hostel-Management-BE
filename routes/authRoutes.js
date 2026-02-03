// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs"); // ✅ Make sure this is installed
const User = require("../models/User"); // ✅ Make sure path is correct

router.post("/login", async (req, res) => {
  const { email, username, password } = req.body;
  const loginIdentifier = email || username;

  try {
    // Find user by email or username
    const user = await User.findOne({ 
      $or: [
        { email: loginIdentifier },
        { username: loginIdentifier }
      ]
    });
    
    if (!user) {
      console.log(`❌ User not found: ${loginIdentifier}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password - handle both hashed and plaintext for backwards compatibility
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (err) {
      // Fallback: check plaintext password
      isMatch = password === user.password;
    }

    if (!isMatch) {
      console.log(`❌ Invalid password for user: ${loginIdentifier}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    console.log(`✅ Login successful for user: ${loginIdentifier}, role: ${user.role}`);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;