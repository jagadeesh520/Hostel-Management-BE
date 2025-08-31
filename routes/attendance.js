const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const { auth, roleCheck } = require("../middleware/auth");
const Student = require("../models/Student");
const CampusLocation = require("../models/CampusLocation");
const upload = require("../middleware/upload");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

// routes/attendance.js (or wherever this route lives)
// routes/attendance.js
router.post("/mark", auth, roleCheck(["Warden"]), async (req, res) => {
  try {
    let {
      studentId,
      status,              // "Present" | "Absent"
      date,                // any ISO-like date input
      studentName,
      roomNo,
      rollNo,
      blockName,
      force                // optional: boolean or "1"/"true"
    } = req.body;

    // ---- 1) Validate inputs
    if (!studentId || !status || !date) {
      return res.status(400).json({ message: "studentId, status, and date are required." });
    }
    status = String(status).trim();
    if (!["Present", "Absent"].includes(status)) {
      return res.status(400).json({ message: "status must be 'Present' or 'Absent'." });
    }
    const forceBool =
      force === true || force === "true" || force === "1" || force === 1;

    // ---- 2) Normalize date to "YYYY-MM-DD" (UTC)
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ message: "Invalid date." });
    }
    d.setUTCHours(0, 0, 0, 0);
    const dateStr = d.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // ---- 3) Build guarded filter (protect approved-leave absences)
    const filter = { studentId, date: dateStr };
    if (!forceBool) {
      filter.isApprovedLeave = { $ne: true };
    }

    // ---- 4) Build update
    const baseSets = {
      studentName,
      roomNo,
      rollNo,
      blockName,
      status,
      timestamp: new Date(),
    };

    // Since this is manual mark, ensure we clear any old leave metadata
    const unsetIfNotLeave = {
      leaveId: "",
      leaveType: "",
      leaveReason: "",
      isApprovedLeave: "",
    };

    // ---- 5) Upsert with guard
    const result = await Attendance.updateOne(
      filter,
      {
        $setOnInsert: { studentId, date: dateStr },
        $set: baseSets,
        $unset: unsetIfNotLeave,
      },
      { upsert: true, runValidators: true }
    );

    // If protected by approved-leave flag and not forced, tell client
    if (!forceBool && result.matchedCount === 0 && result.upsertedCount !== 1 && result.modifiedCount === 0) {
      return res.status(409).json({
        message: "This day is an approved-leave absence and cannot be changed.",
        hint: "Send { force: true } to override if you really need to.",
      });
    }

    // ---- 6) Return the fresh document for convenience
    const doc = await Attendance.findOne({ studentId, date: dateStr }).lean();

    return res.json({
      message:
        result.upsertedCount ? "Attendance created." :
        result.modifiedCount ? "Attendance updated." :
        "No change required.",
      attendance: doc,
    });
  } catch (err) {
    // Handle duplicate key races cleanly
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate attendance for this date exists. Try updating instead." });
    }
    console.error("❌ Error saving/updating attendance:", err);
    return res.status(500).json({ message: "Server error" });
  }
});



// GET attendance for a specific date
router.get("/list", auth, roleCheck(["Warden"]), async (req, res) => {
  const { date, block } = req.query;
  console.log("block", block);
  try {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    console.log(`📅 Fetching attendance for date: ${date}`);
    console.log(
      `⏰ Date range: ${start.toISOString()} to ${end.toISOString()}`
    );
    console.log(`🏢 Block: ${block}`);

    // Step 1: Get students (by block if provided)
    const studentQuery = block ? { blockName: block } : {};
    const students = await Student.find(
      studentQuery,
      "_id studentName roomNo blockName"
    );

    console.log(
      `👨‍🎓 Students found${block ? ` in block ${block}` : ""}: ${
        students.length
      }`
    );
    console.log("👨‍🎓 Students fetched:", students);

    // Step 2: Get attendance records
    const attendanceRecords = await Attendance.find({
      date: date,
      //blockName: block,
    });
    console.log(`🗒️ Attendance records found: ${attendanceRecords.length}`);

    // Step 3: Merge attendance with students
    const attendanceList = students.map((student) => {
      const record = attendanceRecords.find(
        (att) => att.studentId?.toString() === student._id.toString()
      );

      const status = record?.status || "NotMarked";
      const marked = !!record?.status;

      console.log(
        `➡️ Student: ${student.studentName}, Room: ${
          student.roomNo
        }, Status: ${status}, Marked: ${marked ? "✅" : "❌"}`
      );

      return {
        studentId: student._id,
        studentName: student.studentName,
        roomNo: student.roomNo,
        status,
        marked,
        blockName: student.blockName,
      };
    });

    console.log("✅ Final attendance list prepared. Sending response...");
    res.json(attendanceList);
  } catch (err) {
    console.error("❌ Error fetching attendance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Location-based attendance update
router.post("/location/update", async (req, res) => {
  console.log("🔥 /location/update called with body:", req.body);
  const { rollNo, latitude, longitude, timestamp } = req.body;

  try {
    const student = await Student.findOne({ rollNo });
    if (!student) return res.status(404).json({ message: "Student not found" });

    console.log("🎓 Student collegeName:", student.collegeName);

    const campus = await CampusLocation.findOne({
      collegeName: student.collegeName,
    });

    console.log("📍 Student location:", latitude, longitude);
    console.log("🎓 Campus location:", campus.latitude, campus.longitude);
    console.log("📏 Radius (meters):", campus.radius);

    if (!campus)
      return res.status(404).json({ message: "Campus location not found" });

    // Haversine formula to calculate distance in meters
    const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
      const R = 6371000; // radius of Earth in meters
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) *
          Math.cos(lat2 * (Math.PI / 180)) *
          Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const distance = getDistanceFromLatLonInMeters(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(campus.latitude),
      parseFloat(campus.longitude)
    );

    console.log("📐 Calculated distance:", distance);

    console.log(
      `📏 Distance to campus: ${distance} meters (allowed: ${campus.radius}m)`
    );

    const status = distance <= campus.radius ? "Present" : "Absent";
    const date = new Date(timestamp).toISOString().split("T")[0];

    // Update only status and timestamp if record exists
    const updated = await Attendance.findOneAndUpdate(
      { studentId: student._id, date },
      {
        $set: {
          status,
          timestamp: new Date(timestamp),
        },
      },
      { new: true }
    );

    if (!updated) {
      // Create new if not exists
      await Attendance.create({
        studentId: student._id,
        studentName: student.studentName,
        roomNo: student.roomNo,
        rollNo: student.rollNo,
        blockName: student.blockName,
        status,
        timestamp: new Date(timestamp),
        date,
      });
    }

    res.json({ message: `Attendance marked as ${status}` });
  } catch (err) {
    console.error("❌ Error updating location-based attendance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* router.post("/recognize", upload.single("faceImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const imagePath = req.file.path;
    if (!fs.existsSync(imagePath)) {
      return res.status(400).json({ message: "Uploaded image not found." });
    }

    //const pythonPath = "C:\\Program Files\\Python39\\python.exe";
    const pythonPath = process.env.PYTHON_PATH || "python3"; 
    const scriptPath = path.join(
      __dirname,
      "../scripts/recognize_from_upload.py"
    );

    const pythonProcess = spawn(pythonPath, [scriptPath, imagePath]);

    let resultData = "";
    let errorData = "";

    // const logTime = new Date().toISOString().replace(/[:.]/g, "-");
    // const logDir = path.join(__dirname, "../logs");
    // if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

    // const stdoutLog = path.join(logDir, `stdout-${logTime}.log`);
    // const stderrLog = path.join(logDir, `stderr-${logTime}.log`);

    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      resultData += output;
      // fs.appendFileSync(stdoutLog, output);
    });

    pythonProcess.stderr.on("data", (data) => {
      const error = data.toString();
      errorData += error;
      // fs.appendFileSync(stderrLog, error);
    });

    pythonProcess.on("close", async (code) => {
      fs.unlink(imagePath, (err) => {
        if (err) console.error("❌ Error deleting temp image:", err);
        else console.log("🗑️ Deleted temp image:", imagePath);
      });

      if (code !== 0) {
        return res.status(500).json({
          message: "Recognition failed.",
          error: errorData || "Unknown error",
        });
      }

      const lines = resultData.trim().split("\n");
      const recognizedId = lines[lines.length - 1].trim();

      const expectedRollNo = req.body.rollNo;

      if (recognizedId !== expectedRollNo) {
        console.warn(
          `[⚠️] Face mismatch: scanned ${recognizedId}, expected ${expectedRollNo}`
        );
        return res.status(403).json({
          message: `Face mismatch: scanned ${recognizedId}, expected ${expectedRollNo}`,
          student: null,
        });
      }

      if (
        !recognizedId ||
        recognizedId === "Unknown" ||
        recognizedId === "[]"
      ) {
        return res.status(404).json({ message: "Student not recognized." });
      }

      const student = await Student.findOne({ rollNo: recognizedId });
      if (!student) {
        return res.status(404).json({ message: "Student not found in DB." });
      }

      const now = new Date();
      const dateOnly = now.toISOString().split("T")[0];

      let existingAttendance = await Attendance.findOne({
        studentId: student._id,
        date: dateOnly,
      });

      if (existingAttendance) {
        if (existingAttendance.status !== "Present") {
          existingAttendance.status = "Present";
          existingAttendance.timestamp = now;
          await existingAttendance.save();
          console.log(`[✅] Attendance updated for ${student.studentName}`);
        } else {
          console.log(`[ℹ️] Already marked Present for ${student.studentName}`);
        }
      } else {
        await Attendance.create({
          studentId: student._id,
          studentName: student.studentName,
          roomNo: student.roomNo,
          rollNo: student.rollNo,
          blockName: student.blockName,
          status: "Present",
          timestamp: now,
          date: dateOnly,
        });
        console.log(`[🆕] Attendance created for ${student.studentName}`);
      }

      return res.status(200).json({
        message: "Attendance marked successfully",
        student: {
          id: student._id,
          rollNo: student.rollNo,
          studentName: student.studentName,
          roomNo: student.roomNo,
          blockName: student.blockName,
        },
      });
    });
  } catch (err) {
    console.error("❌ Error in /recognize route:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}); */

router.post("/recognize", upload.single("faceImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const imagePath = req.file.path;
    if (!fs.existsSync(imagePath)) {
      return res.status(400).json({ message: "Uploaded image not found." });
    }

    // ✅ Correct venv path
    const pythonPath = path.join(__dirname, "../venv/bin/python3");
    const scriptPath = path.join(__dirname, "../scripts/recognize_from_upload.py");

    console.log("▶ Running Python:", pythonPath, scriptPath, imagePath, req.body.rollNo);

    // Pass rollNo as argument also
    const pythonProcess = spawn(pythonPath, [scriptPath, imagePath, req.body.rollNo]);

    let resultData = "";
    let errorData = "";

    pythonProcess.stdout.on("data", (data) => {
      console.log("🐍 Python stdout:", data.toString());
      resultData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error("🐍 Python stderr:", data.toString());
      errorData += data.toString();
    });

    pythonProcess.on("close", async (code) => {
      // cleanup temp image
      fs.unlink(imagePath, (err) => {
        if (err) console.error("❌ Error deleting temp image:", err);
      });

      console.log("🐍 Python exited with code:", code);
      console.log("🐍 Full Python result:", resultData);

      if (code !== 0) {
        return res.status(500).json({
          message: "Recognition failed.",
          error: errorData || "Unknown error",
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(resultData.trim());
      } catch (err) {
        console.error("❌ Failed to parse Python output as JSON:", err);
        return res.status(500).json({ message: "Invalid recognition output", raw: resultData });
      }

      const { recognizedId, distance, status } = parsed;
      const expectedRollNo = req.body.rollNo;

      console.log("✅ RecognizedId:", recognizedId, "| Expected:", expectedRollNo, "| Distance:", distance);

      if (!recognizedId || recognizedId === "Unknown") {
        return res.status(404).json({ message: "Student not recognized." });
      }

      if (recognizedId !== expectedRollNo) {
        return res.status(403).json({
          message: `Face mismatch: scanned ${recognizedId}, expected ${expectedRollNo}`,
          distance,
          student: null,
        });
      }

      const student = await Student.findOne({ rollNo: recognizedId });
      if (!student) {
        return res.status(404).json({ message: "Student not found in DB." });
      }

      // ✅ Save attendance
      const now = new Date();
      const dateOnly = now.toISOString().split("T")[0];

      let existingAttendance = await Attendance.findOne({
        studentId: student._id,
        date: dateOnly,
      });

      if (existingAttendance) {
        if (existingAttendance.status !== "Present") {
          existingAttendance.status = "Present";
          existingAttendance.timestamp = now;
          await existingAttendance.save();
        }
      } else {
        await Attendance.create({
          studentId: student._id,
          studentName: student.studentName,
          roomNo: student.roomNo,
          rollNo: student.rollNo,
          blockName: student.blockName,
          status: "Present",
          timestamp: now,
          date: dateOnly,
        });
      }

      return res.status(200).json({
        message: "Attendance marked successfully",
        student: {
          id: student._id,
          rollNo: student.rollNo,
          studentName: student.studentName,
          roomNo: student.roomNo,
          blockName: student.blockName,
        },
        distance, // include distance for debugging
      });
    });
  } catch (err) {
    console.error("❌ Error in /recognize route:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(500).json({ message: "Internal server error" });
  }
});



module.exports = router;
