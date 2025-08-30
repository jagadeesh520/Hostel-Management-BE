// routes/hostelRoutes.js
const express = require("express");
const router = express.Router();
const Hostel = require("../models/Hostel");
const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const { auth, roleCheck } = require("../middleware/auth");

// Only Admin can save hostel data
// routes/hostelRoutes.js
router.post("/create", auth, roleCheck(["admin"]), async (req, res) => {
  const { boys, girls } = req.body;

  // Check if both boys and girls arrays are empty or not provided
  if ((!boys || boys.length === 0) && (!girls || girls.length === 0)) {
    return res.status(400).json({ error: "Invalid hostel data" });
  }

  try {
    const hostelsToCreate = [];

    if (boys && boys.length > 0) {
      hostelsToCreate.push({
        type: "Boys",
        blocks: boys.map((b) => b.trim()), // trimming spaces
      });
    }

    if (girls && girls.length > 0) {
      hostelsToCreate.push({
        type: "Girls",
        blocks: girls.map((g) => g.trim()),
      });
    }

    const savedHostels = await Hostel.insertMany(hostelsToCreate);

    res.status(201).json({
      message: "Hostels created successfully",
      hostels: savedHostels,
    });
  } catch (err) {
    console.error("Hostel save error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all hostels
router.get("/create", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const hostels = await Hostel.find();

    const result = {
      Boys: [],
      Girls: [],
    };

    hostels.forEach((h) => {
      if (h.type === "Boys") result.Boys.push(...h.blocks);
      if (h.type === "Girls") result.Girls.push(...h.blocks);
    });

    res.json(result);
  } catch (err) {
    console.error("Hostel fetch error:", err);
    res.status(500).json({ error: "Failed to fetch hostels" });
  }
}); 

// DELETE /api/hostels/:type/:block
router.delete("/:type/:block", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { type, block } = req.params;
    const hostel = await Hostel.findOne({ type });

    if (!hostel) return res.status(404).json({ error: "Hostel type not found" });

    hostel.blocks = hostel.blocks.filter(b => b.trim() !== block.trim());
    await hostel.save();

    res.json({ message: "Block deleted", blocks: hostel.blocks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// PUT /api/hostels/:type/:oldBlock
// Add this to hostelRoutes.js
router.put("/update", auth, roleCheck(["admin"]), async (req, res) => {
  const { boys, girls } = req.body;

  try {
    // Clear previous hostels
    await Hostel.deleteMany({});

    const hostels = [];

    if (boys?.length) {
      hostels.push({ type: "Boys", blocks: boys.map(b => b.trim()) });
    }

    if (girls?.length) {
      hostels.push({ type: "Girls", blocks: girls.map(g => g.trim()) });
    }

    const saved = await Hostel.insertMany(hostels);
    res.json({ message: "Hostels updated", hostels: saved });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// GET /api/admin/attendance?studentId=xxx&startDate=yyyy-mm-dd&endDate=yyyy-mm-dd
router.get("/attendanceList", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { studentId, startDate, endDate } = req.query;

    const filter = {};
    if (studentId) filter.studentId = studentId;
    if (startDate || endDate) filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);

    const attendance = await Attendance.find(filter).sort({ date: 1 }).lean();

    // Get all unique student IDs in the attendance
    const studentIds = [...new Set(attendance.map(a => a.studentId.toString()))];

    // Fetch student info in bulk
    const students = await Student.find({ _id: { $in: studentIds } })
      .select("studentPhone parentPhone studentName") // fetch only needed fields
      .lean();

    const studentMap = {};
    students.forEach(s => {
      studentMap[s._id.toString()] = {
        studentPhone: s.studentPhone,
        parentPhone: s.parentPhone,
        studentName: s.studentName
      };
    });

    // Group attendance by student
    const grouped = {};
    attendance.forEach(record => {
      const sid = record.studentId.toString();
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push({
        studentName: studentMap[sid]?.studentName || record.studentName,
        studentPhone: studentMap[sid]?.studentPhone || null,
        parentPhone: studentMap[sid]?.parentPhone || null,
        date: record.date,
        status: record.status,
        roomNo: record.roomNo,
        blockName: record.blockName,
        rollNo: record.rollNo
      });
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error("Fetch Attendance Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});





module.exports = router;
