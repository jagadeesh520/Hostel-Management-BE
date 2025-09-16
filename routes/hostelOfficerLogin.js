// ./routes/hostelOfficerLogin.js (patched handler)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HostelOfficer = require('../models/HostelOfficer');

// POST /api/hostelOfficerLogin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await HostelOfficer.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const storedHash = user.password || user.passwordHash;
    const ok = await bcrypt.compare(String(password), storedHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Server config error' });

    // Normalize role and include assignedBlock if available
    const normalizedRole = (user.role || 'hostelofficer').toString();
    const assignedBlock = user.assignedBlock || user.block || null;

    // Put a clear "id" claim (and keep email, role, assignedBlock)
    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: normalizedRole,
      assignedBlock,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    // return both token and authToken (backwards compatible)
    return res.json({
      token,
      authToken: token,
      user: { id: user._id, name: user.name, email: user.email, role: normalizedRole, assignedBlock },
    });
  } catch (err) {
    console.error('hostelOfficerLogin error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
