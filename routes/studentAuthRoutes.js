// routes/studentAuthRoutes.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User"); // Create this if not already
const Student = require("../models/Student");
const { auth,roleCheck } = require("../middleware/auth");

// POST /api/student/login
router.post("/login",async (req, res) => {
  const { email, password } = req.body;
  console.log("req", req.body);

  try {
    const student = await User.findOne({ email });
    if (!student)
      return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: student._id, role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        rollNo: student.rollNo, // 👈 Add this
      },
      token,
    });
  } catch (err) {
    console.error("Student login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get('/roll/:rollNo', async (req, res) => {
    console.log("Welcome")
  try {
    const { rollNo } = req.params;

    const student = await Student.findOne({ rollNo }); // ✅ this will now match correctly
    console.log("Fetched student:", student);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.json(student);
  } catch (err) {
    console.error('Error fetching student by rollNo:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
