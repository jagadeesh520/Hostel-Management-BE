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
      status, // "Present" | "Absent"
      date, // any ISO-like date input
      studentName,
      roomNo,
      rollNo,
      blockName,
      force, // optional: boolean or "1"/"true"
    } = req.body;

    // ---- 1) Validate inputs
    if (!studentId || !status || !date) {
      return res
        .status(400)
        .json({ message: "studentId, status, and date are required." });
    }
    status = String(status).trim();
    if (!["Present", "Absent"].includes(status)) {
      return res
        .status(400)
        .json({ message: "status must be 'Present' or 'Absent'." });
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
    if (
      !forceBool &&
      result.matchedCount === 0 &&
      result.upsertedCount !== 1 &&
      result.modifiedCount === 0
    ) {
      return res.status(409).json({
        message: "This day is an approved-leave absence and cannot be changed.",
        hint: "Send { force: true } to override if you really need to.",
      });
    }

    // ---- 6) Return the fresh document for convenience
    const doc = await Attendance.findOne({ studentId, date: dateStr }).lean();

    return res.json({
      message: result.upsertedCount
        ? "Attendance created."
        : result.modifiedCount
        ? "Attendance updated."
        : "No change required.",
      attendance: doc,
    });
  } catch (err) {
    // Handle duplicate key races cleanly
    if (err?.code === 11000) {
      return res.status(409).json({
        message:
          "Duplicate attendance for this date exists. Try updating instead.",
      });
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

router.post("/recognize", upload.single("faceImage"), async (req, res) => {
  try {
    if (!req.file) {
      console.warn("[NODE] No image uploaded");
      return res
        .status(200)
        .json({ status: "error", message: "No image uploaded" });
    }

    const imagePath = req.file.path;
    if (!fs.existsSync(imagePath)) {
      console.warn("[NODE] Uploaded image not found:", imagePath);
      return res
        .status(200)
        .json({ status: "error", message: "Uploaded image not found" });
    }

    // ✅ Use venv python
    const pythonPath = path.join(__dirname, "../venv/bin/python3");
    const scriptPath = path.join(
      __dirname,
      "../scripts/recognize_from_upload.py"
    );

    console.log(
      "[NODE] Running Python:",
      pythonPath,
      scriptPath,
      imagePath,
      req.body.rollNo
    );

    const pythonProcess = spawn(pythonPath, [
      scriptPath,
      imagePath,
      req.body.rollNo,
    ]);

    let resultData = "";
    let errorData = "";

    pythonProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log("[NODE] Python stdout:", msg.trim());
      resultData += msg;
    });

    pythonProcess.stderr.on("data", (data) => {
      const errMsg = data.toString();
      console.error("[NODE] Python stderr:", errMsg.trim());
      errorData += errMsg;
    });

    pythonProcess.on("close", async (code) => {
      // cleanup
      fs.unlink(imagePath, (err) => {
        if (err) console.error("[NODE] Error deleting temp image:", err);
        else console.log("[NODE] Deleted temp image:", imagePath);
      });

      console.log("[NODE] Python process exited with code:", code);
      console.log("[NODE] Full Python result:", resultData.trim());

      if (code !== 0) {
        return res.status(200).json({
          status: "error",
          message: "Recognition failed",
          error: errorData || "Unknown error",
        });
      }

      let parsed;
      try {
        // ✅ take only the last non-empty line (avoids logs breaking JSON.parse)
        const lines = resultData
          .trim()
          .split("\n")
          .filter((l) => l.trim() !== "");
        const lastLine = lines[lines.length - 1];
        parsed = JSON.parse(lastLine);
      } catch (err) {
        console.error("[NODE] Failed to parse Python output:", err.message);
        return res.status(200).json({
          status: "error",
          message: "Invalid recognition output",
          raw: resultData,
        });
      }

      const { recognizedId, distance, status } = parsed;
      const expectedRollNo = req.body.rollNo;

      console.log(
        "[NODE] Parsed result =>",
        "RecognizedId:",
        recognizedId,
        "| Expected:",
        expectedRollNo,
        "| Status:",
        status,
        "| Distance:",
        distance
      );

      // === Handle statuses ===
      if (status === "error") {
        return res.status(200).json({ status: "error", details: parsed });
      }

      if (status === "unmatched") {
        return res.status(200).json({ status: "unmatched", distance });
      }

      if (status === "mismatch") {
        return res.status(200).json({
          status: "mismatch",
          message: `Face mismatch: scanned ${recognizedId}, expected ${expectedRollNo}`,
          distance,
        });
      }

      if (status === "matched") {
        const student = await Student.findOne({ rollNo: recognizedId });
        if (!student) {
          console.warn("[NODE] Student not found in DB:", recognizedId);
          return res
            .status(200)
            .json({ status: "error", message: "Student not found in DB" });
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
            console.log("[NODE] Attendance updated for:", student.studentName);
          } else {
            console.log(
              "[NODE] Attendance already marked for:",
              student.studentName
            );
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
          console.log("[NODE] Attendance created for:", student.studentName);
        }

        return res.status(200).json({
          status: "matched",
          message: "Attendance marked successfully",
          student: {
            id: student._id,
            rollNo: student.rollNo,
            studentName: student.studentName,
            roomNo: student.roomNo,
            blockName: student.blockName,
          },
          distance,
        });
      }

      // Fallback
      return res.status(200).json({
        status: "error",
        message: "Unexpected recognition status",
        parsed,
      });
    });
  } catch (err) {
    console.error("[NODE] Error in /recognize route:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    return res
      .status(200)
      .json({ status: "error", message: "Internal server error" });
  }
});

// Store embeddings
router.post("/store-embeddings", (req, res) => {
  console.log("🔥 store-embeddings hit!");
  const pythonPath = path.join(__dirname, "../venv/bin/python3");
  const scriptPath = path.join(__dirname, "../scripts/store_embeddings_to_mongo.py");
  const process = spawn(pythonPath, [scriptPath]);

  process.stdout.on("data", (data) => console.log(`Embeddings Output: ${data}`));
  process.stderr.on("data", (data) => console.error(`Embeddings Error: ${data}`));

  process.on("close", (code) => {
    if (code === 0) {
      res.json({ success: true, message: "Embeddings stored successfully" });
    } else {
      res.status(500).json({ success: false, message: "Failed to store embeddings" });
    }
  });
});

// Build FAISS index
router.post("/build-index", (req, res) => {
  console.log("🔥 build-embeddings hit!");
  const pythonPath = path.join(__dirname, "../venv/bin/python3");
  const scriptPath = path.join(__dirname, "../scripts/build_faiss_index.py");
  const process = spawn(pythonPath, [scriptPath]);

  process.stdout.on("data", (data) => console.log(`Index Output: ${data}`));
  process.stderr.on("data", (data) => console.error(`Index Error: ${data}`));

  process.on("close", (code) => {
    if (code === 0) {
      res.json({ success: true, message: "FAISS index built successfully" });
    } else {
      res.status(500).json({ success: false, message: "Failed to build index" });
    }
  });
});


module.exports = router;
