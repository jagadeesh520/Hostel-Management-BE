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

router.post("/mark", auth, roleCheck(["Warden"]), async (req, res) => {
  const { studentId, status, date, studentName, roomNo, rollNo, blockName } =
    req.body;

  try {
    const attendanceDate = new Date(date);
    const attendanceDateString = attendanceDate.toISOString().split("T")[0];
    const nextDay = new Date(date);
    nextDay.setHours(23, 59, 59, 999);

    // 🔄 Check if already marked
    const existingRecord = await Attendance.findOne({
      studentId,
      date: attendanceDateString,
    });

    if (existingRecord) {
      // ✏️ Update the existing record
      existingRecord.status = status;
      existingRecord.studentName = studentName;
      existingRecord.roomNo = roomNo;
      existingRecord.rollNo = rollNo;
      existingRecord.blockName = blockName;

      await existingRecord.save();
      return res.json({ message: "Attendance updated successfully." });
    }

    // ✅ Insert new record with correct date
    const attendance = new Attendance({
      studentId,
      status,
      date: attendanceDate, // ✅ THIS LINE FIXES THE BUG
      studentName,
      roomNo,
      rollNo,
      blockName,
    });

    await attendance.save();
    res.json({ message: "Attendance marked successfully." });
  } catch (err) {
    console.error("❌ Error saving/updating attendance:", err.message);
    res.status(500).json({ message: "Server error" });
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

    console.log("Welcome update", updated);
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

router.post("/recognize", upload.single("faceImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const imagePath = req.file.path;
    if (!fs.existsSync(imagePath)) {
      return res.status(400).json({ message: "Uploaded image not found." });
    }

    const pythonPath = "C:\\Program Files\\Python39\\python.exe";
    const scriptPath = path.join(__dirname, "../scripts/recognize_from_upload.py");

    const pythonProcess = spawn(pythonPath, [scriptPath, imagePath]);

    let resultData = "";
    let errorData = "";

    const logTime = new Date().toISOString().replace(/[:.]/g, "-");
    const logDir = path.join(__dirname, "../logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

    const stdoutLog = path.join(logDir, `stdout-${logTime}.log`);
    const stderrLog = path.join(logDir, `stderr-${logTime}.log`);

    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      resultData += output;
      fs.appendFileSync(stdoutLog, output);
    });

    pythonProcess.stderr.on("data", (data) => {
      const error = data.toString();
      errorData += error;
      fs.appendFileSync(stderrLog, error);
    });

    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        return res.status(500).json({
          message: "Recognition failed.",
          error: errorData || "Unknown error",
        });
      }

      const lines = resultData.trim().split("\n");
      const recognizedId = lines[lines.length - 1].trim();

      if (!recognizedId || recognizedId === "Unknown" || recognizedId === "[]") {
        return res.status(404).json({ message: "Student not recognized." });
      }

      const student = await Student.findOne({ rollNo: recognizedId });
      if (!student) {
        return res.status(404).json({ message: "Student not found in DB." });
      }

      const now = new Date();
      const dateOnly = now.toISOString().split("T")[0]; // Format: "YYYY-MM-DD"

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
    return res.status(500).json({ message: "Internal server error" });
  }
});
module.exports = router;
