// routes/studentAuthRoutes.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User"); // Create this if not already
const Student = require("../models/Student");
const Attendance = require("../models/Attendance")
const { auth,roleCheck } = require("../middleware/auth");

// POST /api/student/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("req", req.body);

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    // normalize incoming identifier:
    const rawId = String(email).trim();           // whatever the user typed
    const byEmail = rawId.toLowerCase();         // normalize email to lowercase
    const byRoll = rawId.toUpperCase();          // normalize rollNo to uppercase

    // Try to find user by either email (lowercase) or rollNo (uppercase)
    const student = await User.findOne({
      $or: [{ email: byEmail }, { rollNo: byRoll }],
    });

    if (!student) {
      console.log("Login failed: no user found for", { byEmail, byRoll });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(String(password).trim(), student.password);
    if (!isMatch) {
      console.log("Login failed: password mismatch for user", student._id);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: student._id, role: student.role || "student" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        rollNo: student.rollNo,
      },
      token,
    });
  } catch (err) {
    console.error("Student login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.get('/roll/:rollNo', async (req, res) => {
    //console.log("Welcome")
  try {
    const { rollNo } = req.params;

    const student = await Student.findOne({ rollNo }); // ✅ this will now match correctly

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.json(student);
  } catch (err) {
    console.error('Error fetching student by rollNo:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get("/check/:rollNo", async (req, res) => {
  const rollNo = req.params.rollNo?.trim();
  const dateStr = req.query.date?.trim();

  if (!rollNo || !dateStr) {
    return res.status(400).json({ error: "Missing rollNo or date" });
  }

  try {
    const record = await Attendance.findOne({ rollNo, date: dateStr });

    if (!record) {
      return res.json({ exists: false }); // no record at all
    }

    const isPresent = record.status === "Present";

    return res.json({
      exists: isPresent, // true only if marked present
      status: record.status,
      timestamp: record.timestamp,
    });
  } catch (err) {
    console.error("Attendance check error:", err);
    res.status(500).json({ error: "Server error" });
  }
});




router.post("/change-password", async (req, res) => {
  try {
    console.log("Request body:", req.body);

    const { rollNo, oldPassword, newPassword } = req.body;

    if (!rollNo || !oldPassword || !newPassword) {
      return res.status(400).json({ error: "Please provide all required fields" });
    }

    // Find user by rollNo
    const user = await User.findOne({ rollNo });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Compare old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: "Incorrect current password" });

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    console.log("Password updated for:", user.rollNo);
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


module.exports = router;
