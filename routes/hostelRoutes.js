// routes/hostelRoutes.js
const express = require("express");
const router = express.Router();
const Hostel = require("../models/Hostel");
const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const { auth, roleCheck } = require("../middleware/auth");
const BlockRule = require("../models/BlockRule");

// Only Admin can save hostel data
// routes/hostelRoutes.js
// routes/hostelRoutes.js
router.post(
  "/create",
  auth,
  roleCheck(["admin", "Warden"]),
  async (req, res) => {
    const { boys, girls } = req.body;

    if ((!boys || boys.length === 0) && (!girls || girls.length === 0)) {
      return res.status(400).json({ error: "Invalid hostel data" });
    }

    try {
      const hostelsToCreate = [];

      if (boys?.length) {
        hostelsToCreate.push({
          type: "Boys",
          blocks: boys.map((b) => ({
            name: b.trim(),
            floors: [],
          })),
        });
      }

      if (girls?.length) {
        hostelsToCreate.push({
          type: "Girls",
          blocks: girls.map((g) => ({
            name: g.trim(),
            floors: [],
          })),
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
  }
);

// Get all hostels
router.get(
  "/create",
  auth,
  roleCheck(["admin", "Warden", "Student"]),
  async (req, res) => {
    try {
      const hostels = await Hostel.find().populate(
        "blocks.floors.rooms.beds.studentId", // path
        "studentName rollNo"                  // only these fields
      );

      const result = { Boys: [], Girls: [] };

      hostels.forEach((h) => {
        if (h.type === "Boys") result.Boys.push(...h.blocks);
        if (h.type === "Girls") result.Girls.push(...h.blocks);
      });

      res.json(result);
    } catch (err) {
      console.error("Hostel fetch error:", err);
      res.status(500).json({ error: "Failed to fetch hostels" });
    }
  }
);


// POST /api/hostels/warden/add-floor
// POST /api/hostels/warden/add-floor
// Add floor(s) to a block (Warden or Admin)
router.post(
  "/warden/add-floor",
  auth,
  roleCheck(["admin", "Warden"]),
  async (req, res) => {
    try {
      const { blockName, floors } = req.body;

      if (!blockName || !floors || !floors.length) {
        return res
          .status(400)
          .json({ error: "Block name and floors are required" });
      }

      // Find hostel that contains the block
      const hostel = await Hostel.findOne({ "blocks.name": blockName });
      if (!hostel) {
        return res.status(404).json({ error: "Block not found" });
      }

      const block = hostel.blocks.find((b) => b.name === blockName);

      // Prevent duplicate floor numbers
      floors.forEach((newFloor) => {
        const exists = block.floors.some(
          (f) => f.floorNumber === newFloor.floorNumber
        );
        if (exists) {
          throw new Error(
            `Floor ${newFloor.floorNumber} already exists in block ${blockName}`
          );
        }
      });

      // Push new floors
      block.floors.push(...floors);

      await hostel.save();
      res.json({ message: "Floors added successfully", hostel });
    } catch (err) {
      console.error("Error adding floors:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to add floors to block" });
    }
  }
);

// PUT /api/hostels/admin/block-room
router.put(
  "/admin/block-room",
  auth,
  roleCheck(["admin"]),
  async (req, res) => {
    try {
      const { blockName, roomNumber, isBlocked } = req.body;

      if (!blockName || !roomNumber) {
        return res.status(400).json({ error: "blockName and roomNumber are required" });
      }

      const hostel = await Hostel.findOne({
        "blocks.name": blockName,
        "blocks.floors.rooms.roomNumber": roomNumber,
      });

      if (!hostel) return res.status(404).json({ error: "Room not found" });

      hostel.blocks.forEach((block) => {
        if (block.name === blockName) {
          block.floors.forEach((floor) => {
            floor.rooms.forEach((room) => {
              if (room.roomNumber === roomNumber) {
                room.isBlocked = isBlocked; // ✅ Add new field
              }
            });
          });
        }
      });

      await hostel.save();
      res.json({ message: `Room ${roomNumber} updated`, isBlocked });
    } catch (err) {
      console.error("Block room error:", err);
      res.status(500).json({ error: "Failed to block room" });
    }
  }
);

// routes/hostelRoutes.js

router.post("/student/book-bed", auth, roleCheck(["student"]), async (req, res) => {
  try {
    const { blockName, roomNumber, bedNumber, rollNo } = req.body;

    if (!rollNo) {
      return res.status(400).json({ error: "Roll number is required" });
    }

    // 1️⃣ Find the student by roll number
    const student = await Student.findOne({ rollNo });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // 2️⃣ Check if this student already booked any bed
    const alreadyBooked = await Hostel.findOne({
      "blocks.floors.rooms.beds.studentId": student._id,
    });
    if (alreadyBooked) {
      return res.status(400).json({ error: "You have already booked a bed" });
    }

    // 3️⃣ Find the hostel block
    const hostel = await Hostel.findOne({ "blocks.name": blockName });
    if (!hostel) return res.status(404).json({ error: "Block not found" });

    let roomFound = null;
    hostel.blocks.forEach((block) => {
      if (block.name === blockName) {
        block.floors.forEach((floor) => {
          floor.rooms.forEach((room) => {
            if (room.roomNumber === roomNumber) {
              roomFound = room;
            }
          });
        });
      }
    });

    if (!roomFound) return res.status(404).json({ error: "Room not found" });
    if (roomFound.isBlocked)
      return res.status(400).json({ error: "Room is blocked by Admin" });

    // 4️⃣ Find the bed
    const bed = roomFound.beds.find((b) => b.bedNumber === bedNumber);
    if (!bed) return res.status(404).json({ error: "Bed not found" });
    if (bed.occupied) return res.status(400).json({ error: "Bed already booked" });

    // 5️⃣ Book the bed inside hostel
    bed.occupied = true;
    bed.studentId = student._id;
    await hostel.save();

    // 6️⃣ Update Student collection with selected room (skip validation)
    await Student.updateOne(
      { _id: student._id },
      {
        $set: {
          roomNo: roomNumber,
          blockName: blockName,
        },
      },
      { runValidators: false } // ✅ prevents re-validating required fields
    );

    // 🔍 Fetch updated student
    const updatedStudent = await Student.findById(student._id);

    res.json({
      message: `Bed ${bedNumber} booked in Room ${roomNumber}`,
      student: updatedStudent,
    });
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ error: "Booking failed" });
  }
});

// Student fetches their assigned block automatically
router.get(
  "/student/assigned-block/:rollNo",
  auth,
  roleCheck(["Student"]),
  async (req, res) => {
    try {
      const { rollNo } = req.params;

      // 1. Get student details
      const student = await Student.findOne({ rollNo });
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // 2. Find block assignment rule (gender + year)
      const rule = await BlockRule.findOne({
        gender: student.gender,
        year: student.year,
      });

      if (!rule) {
        return res.status(404).json({
          error: `No block assigned for ${student.gender} - ${student.year}`,
        });
      }

      // 3. Find actual hostel + block
      const hostel = await Hostel.findOne({ "blocks.name": rule.blockName });
      if (!hostel) {
        return res.status(404).json({ error: "Block not found in hostel records" });
      }

      const block = hostel.blocks.find((b) => b.name === rule.blockName);
      if (!block) {
        return res.status(404).json({ error: "Block missing in hostel structure" });
      }

      // 4. Return final data
      res.json({
        type: hostel.type, // Boys / Girls
        blockName: rule.blockName,
        floors: block.floors,
        student: {
          name: student.studentName,
          rollNo: student.rollNo,
          year: student.year,
          gender: student.gender,
        },
      });
    } catch (err) {
      console.error("Assigned block fetch error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);


// Get student's current booking
router.get("/student/my-booking/:rollNo", auth, roleCheck(["student"]), async (req, res) => {
  try {
    const { rollNo } = req.params;

    // Find the student in DB
    const student = await Student.findOne({ rollNo });
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Search inside hostels for this student's bed
    const hostels = await Hostel.find();
    for (const hostel of hostels) {
      for (const block of hostel.blocks) {
        for (const floor of block.floors) {
          for (const room of floor.rooms) {
            for (const bed of room.beds) {
              if (bed.studentId && bed.studentId.toString() === student._id.toString()) {
                return res.json({
                  blockName: block.name,
                  roomNumber: room.roomNumber,
                  bedNumber: bed.bedNumber,
                  studentName: student.studentName,
                  rollNo: student.rollNo,
                });
              }
            }
          }
        }
      }
    }

    return res.status(404).json({ error: "No booking found" });
  } catch (err) {
    console.error("Fetch booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/admin/set-block-rule",
  auth,
  roleCheck(["admin"]),
  async (req, res) => {
    try {
      const { gender, year, blockName } = req.body;

      if (!gender || !year || !blockName) {
        return res.status(400).json({ error: "gender, year, and blockName are required" });
      }

      // upsert rule (update if exists, else insert)
      const rule = await BlockRule.findOneAndUpdate(
        { gender, year },
        { blockName },
        { new: true, upsert: true }
      );

      res.json({ message: "Rule saved successfully", rule });
    } catch (err) {
      console.error("Set block rule error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get all rules
router.get("/admin/block-rules", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const rules = await BlockRule.find();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

// Delete rule
router.delete("/admin/block-rule/:id", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    await BlockRule.findByIdAndDelete(req.params.id);
    res.json({ message: "Rule deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete rule" });
  }
});


// DELETE /api/hostels/:type/:blockName
router.delete(
  "/:type/:blockName",
  auth,
  roleCheck(["admin"]),
  async (req, res) => {
    try {
      const { type, blockName } = req.params;
      const hostel = await Hostel.findOne({ type });

      if (!hostel)
        return res.status(404).json({ error: "Hostel type not found" });

      hostel.blocks = hostel.blocks.filter(
        (b) => b.name.trim() !== blockName.trim()
      );
      await hostel.save();

      res.json({ message: "Block deleted", blocks: hostel.blocks });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Delete failed" });
    }
  }
);

// PUT /api/hostels/:type/:oldBlock
// Add this to hostelRoutes.js
router.put("/update", auth, roleCheck(["admin"]), async (req, res) => {
  const { boys, girls } = req.body;

  try {
    // Clear previous hostels
    await Hostel.deleteMany({});

    const hostels = [];

    if (boys?.length) {
      hostels.push({
        type: "Boys",
        blocks: boys.map((b) => ({ name: b.trim(), floors: [] })),
      });
    }

    if (girls?.length) {
      hostels.push({
        type: "Girls",
        blocks: girls.map((g) => ({ name: g.trim(), floors: [] })),
      });
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
    const studentIds = [
      ...new Set(attendance.map((a) => a.studentId.toString())),
    ];

    // Fetch student info in bulk
    const students = await Student.find({ _id: { $in: studentIds } })
      .select("studentPhone parentPhone studentName") // fetch only needed fields
      .lean();

    const studentMap = {};
    students.forEach((s) => {
      studentMap[s._id.toString()] = {
        studentPhone: s.studentPhone,
        parentPhone: s.parentPhone,
        studentName: s.studentName,
      };
    });

    // Group attendance by student
    const grouped = {};
    attendance.forEach((record) => {
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
        rollNo: record.rollNo,
      });
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error("Fetch Attendance Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
