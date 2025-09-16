const express = require("express");
const router = express.Router();
const fs = require("fs");
const csv = require("csv-parser");
const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const upload = require("../middleware/upload");
const { auth, roleCheck } = require("../middleware/auth");
const uploadFaceImages = require("../middleware/uploadFaceImages");
const User = require("../models/User");

/** -------- helpers -------- */
const normalizeDiet = (raw) => {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "nv") return "non-veg";
  if (/non[\s-]?veg/.test(s)) return "non-veg"; // "non veg", "non-veg", "nonveg"
  if (/(^|[^a-z])non($|[^a-z])/.test(s)) return "non-veg"; // standalone "non"
  return "veg";
};

/** =========================================
 *  GET all students
 *  =======================================*/
router.get("/", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const students = await Student.find();
    return res.json(students);
  } catch (err) {
    console.error("Error fetching students:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/** =========================================
 *  JSON bulk upload: POST /upload
 *  Body: { students: [ { ... } ] }
 *  Accept columns:
 *   - "College Name","Student Name","Gender","Roll No","Year",
 *     "Room No","Block Name","Address","Student Phone","Parent Phone",
 *     "Type" (or "Diet") -> veg/non-veg
 *  =======================================*/
router.post("/upload", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: "No students to upload" });
    }

    // helpers (kept local so this handler is self-contained)
    const normalizeDiet = (raw) => {
      const s = String(raw || "")
        .trim()
        .toLowerCase();
      if (s === "nv") return "non-veg";
      if (/non[\s-]?veg/.test(s)) return "non-veg";
      if (/(^|[^a-z])non($|[^a-z])/.test(s)) return "non-veg";
      return "veg";
    };
    const normalizeRoll = (r) =>
      String(r || "")
        .trim()
        .toUpperCase();

    // map + normalize + attach source row index for better reporting
    const mapped = students.map((s, idx) => ({
      __row: idx + 1,
      collegeName: String(s["College Name"] ?? s.collegeName ?? "").trim(),
      studentName: String(s["Student Name"] ?? s.studentName ?? "").trim(),
      gender: String(s["Gender"] ?? s.gender ?? "").trim(),
      rollNo: normalizeRoll(s["Roll No"] ?? s.rollNo ?? ""),
      year: String(s["Year"] ?? s.year ?? "").trim(),
      roomNo: String(s["Room No"] ?? s.roomNo ?? "").trim(),
      blockName: String(s["Block Name"] ?? s.blockName ?? "").trim(),
      address: String(s["Address"] ?? s.address ?? "").trim(),
      studentPhone: String(s["Student Phone"] ?? s.studentPhone ?? "").trim(),
      parentPhone: String(s["Parent Phone"] ?? s.parentPhone ?? "").trim(),
      type: normalizeDiet(s["Type"] ?? s["Diet"] ?? s.type ?? "veg"),
    }));

    // 1) Validation: required fields
    const invalid = mapped.filter(
      (r) =>
        !r.rollNo ||
        !r.studentName ||
        !r.collegeName ||
        !["veg", "non-veg"].includes(r.type)
    );
    if (invalid.length > 0) {
      return res.status(400).json({
        message: "Some rows are missing required fields or have invalid values",
        invalidRows: invalid.map((r) => ({
          row: r.__row,
          rollNo: r.rollNo,
          studentName: r.studentName,
          collegeName: r.collegeName,
          type: r.type,
        })),
      });
    }

    // 2) Deduplicate rows within upload (keep first occurrence)
    const seen = new Set();
    const unique = [];
    const duplicates = [];
    for (const row of mapped) {
      if (seen.has(row.rollNo)) {
        duplicates.push({ row: row.__row, rollNo: row.rollNo });
        continue;
      }
      seen.add(row.rollNo);
      unique.push(row);
    }

    // 3) Build bulk ops: upsert per rollNo
    // Strategy:
    //  - $setOnInsert: fields set only when inserting (protects against overwriting original name/college)
    //  - $set: fields we allow to update on re-upload (roomNo, year, blockName, phones, address, gender, type)
    const bulkOps = unique.map((m) => ({
      updateOne: {
        filter: { rollNo: m.rollNo },
        update: {
          $setOnInsert: {
            collegeName: m.collegeName,
            studentName: m.studentName,
            rollNo: m.rollNo,
            // keep face fields empty on bulk upload; upload face images separately
            isCompleted: false,
          },
          $set: {
            gender: m.gender || undefined,
            year: m.year || undefined,
            roomNo: m.roomNo || undefined,
            blockName: m.blockName || undefined,
            address: m.address || undefined,
            studentPhone: m.studentPhone || undefined,
            parentPhone: m.parentPhone || undefined,
            type: m.type, // we allow changing diet if admin corrected it
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    // If there's nothing to write (shouldn't happen), return early
    if (bulkOps.length === 0) {
      return res.status(200).json({
        message: "No unique rows to process",
        duplicates,
      });
    }

    const result = await Student.bulkWrite(bulkOps, { ordered: false });

    // Build friendly summary
    const summary = {
      totalRows: students.length,
      uniqueRows: unique.length,
      duplicateRowsInUpload: duplicates.length,
      inserted: result.upsertedCount || 0,
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0,
      // upsertedIds: result.upsertedIds ?? null, // optionally return IDs
    };

    return res.status(200).json({
      message: "Upload processed",
      summary,
      duplicates,
    });
  } catch (err) {
    console.error("Upload Error:", err);

    // handle duplicate key error more explicitly
    if (err && err.code === 11000) {
      return res
        .status(409)
        .json({
          message: "Duplicate key error (existing rollNo conflict)",
          error: err.message,
        });
    }

    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
});

/** =========================================
 *  PATCH student by Mongo _id
 *  Form fields accepted:
 *   - studentName, rollNo, roomNo, year, gender, isCompleted
 *   - type (veg/non-veg)
 *   - faceImages[] (via uploadFaceImages)
 *  =======================================*/
router.patch(
  "/:id",
  auth,
  roleCheck(["admin"]),
  uploadFaceImages.array("faceImages", 5),
  async (req, res) => {
    try {
      const updateData = {
        studentName: req.body.studentName,
        rollNo: req.body.rollNo,
        roomNo: req.body.roomNo,
        year: req.body.year,
        gender: req.body.gender,
        isCompleted:
          req.body.isCompleted === "true" || req.body.isCompleted === true,
      };

      if (typeof req.body.type !== "undefined") {
        updateData.type = normalizeDiet(req.body.type);
      }

      if (req.files && req.files.length > 0) {
        updateData.faceImages = req.files.map(
          (file) => `/uploads/faces/${req.body.rollNo}/${file.filename}`
        );
      }

      const updatedStudent = await Student.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true }
      );

      if (!updatedStudent) {
        return res.status(404).json({ message: "Student not found" });
      }

      res.json(updatedStudent);
    } catch (err) {
      console.error("Error updating student:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/** =========================================
 *  Filter by block
 *  =======================================*/
router.get(
  "/filter",
  auth,
  roleCheck(["admin", "Warden"]),
  async (req, res) => {
    const { block } = req.query;
    try {
      const students = await Student.find({ blockName: block });
      res.json(students);
    } catch (err) {
      console.error("Error fetching students by block:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/** =========================================
 *  Upload single face image by rollNo
 *  =======================================*/
router.put(
  "/upload-face-image/:rollNo",
  upload.single("faceImage"),
  async (req, res) => {
    try {
      const { rollNo } = req.params;
      const imagePath = "/uploads/faces/" + req.file.filename;

      const updatedStudent = await Student.findOneAndUpdate(
        { rollNo },
        { faceImage: imagePath },
        { new: true }
      );

      if (!updatedStudent) {
        return res.status(404).json({ message: "Student not found" });
      }

      res.json(updatedStudent);
    } catch (err) {
      console.error("Image Upload Error:", err.message);
      res.status(500).json({ error: "Image upload failed" });
    }
  }
);

/** =========================================
 *  GET minimal profile by rollNo
 *  (used by frontend to decide rates)
 *  Returns: { gender, year, type }
 *  =======================================*/
router.get("/:rollNo", async (req, res) => {
  try {
    const rollNo = String(req.params.rollNo).trim();
    const s = await Student.findOne({ rollNo })
      .select("gender year type")
      .lean();

    if (!s) return res.status(404).json({ message: "Student not found" });

    res.json({
      gender: s.gender || null,
      year: s.year || null,
      type: normalizeDiet(s.type),
    });
  } catch (e) {
    console.error("GET /students/:rollNo error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/** =========================================
 *  CSV bulk upload -> Users collection (unchanged)
 *  =======================================*/
router.post(
  "/bulk-upload-students",
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "CSV file is required" });

    const fileRows = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (row) => fileRows.push(row))
      .on("end", async () => {
        try {
          const users = await Promise.all(
            fileRows.map(async (row) => ({
              name: row.name,
              email: row.email,
              rollNo: row.rollNo,
              password: await bcrypt.hash(row.password, 10),
              role: "Student",
            }))
          );

          await User.insertMany(users);
          fs.unlinkSync(req.file.path);

          res
            .status(200)
            .json({ message: "Bulk upload successful", count: users.length });
        } catch (err) {
          console.error("Bulk upload error:", err);
          res.status(500).json({ error: err.message });
        }
      })
      .on("error", (err) => {
        console.error("CSV parse error:", err);
        res.status(500).json({ error: "Failed to parse CSV" });
      });
  }
);

module.exports = router;
