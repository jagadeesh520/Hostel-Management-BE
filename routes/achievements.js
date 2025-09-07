// routes/achievements.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const Achievement = require("../models/Achievement");
const Student = require("../models/Student"); // ensure this model exists
const { auth, roleCheck } = require("../middleware/auth");

// Helper: allowed levels (lowercase for case-insensitive check)
const VALID_LEVELS = ["bronze", "silver", "gold", "platinum"];

/**
 * Multer setup: save uploaded images to uploads/achievements
 */
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "achievements");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit (adjust as needed)
  },
  fileFilter: (req, file, cb) => {
    // accept common image mime types
    if (/^image\/(jpe?g|png|gif|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// inside routes/achievements.js — replace the router.post("/", ... ) handler with this
router.post(
  "/",
  auth,
  roleCheck(["admin"]),
  upload.single("image"),
  async (req, res) => {
    try {
      // Debug: log received fields for a short time (remove in prod)
      console.log("[achievements] req.body:", req.body);
      console.log("[achievements] req.query:", req.query);
      console.log("[achievements] req.headers:", {
        "content-type": req.headers["content-type"],
        "content-length": req.headers["content-length"],
      });
      console.log("[achievements] req.file:", !!req.file, req.file ? req.file.filename : null);

      // prefer body, but fallback to query (client might have sent parameters as query)
      const source = (req.body && Object.keys(req.body).length ? req.body : (req.query && Object.keys(req.query).length ? req.query : {}));

      const {
        studentId,
        rollNo: rawRollNo,
        studentName,
        title: rawTitle,
        description: rawDescription,
        category = "Academic",
        level: rawLevel,
        awardedBy = "Administration",
        date,
        image: imageFromBody,
      } = source;

      const uploadedImagePath = req.file ? `/uploads/achievements/${req.file.filename}` : null;
      const image = uploadedImagePath || (imageFromBody ? String(imageFromBody) : null);

      // normalize
      const rollNo = rawRollNo ? String(rawRollNo).trim() : "";
      const title = rawTitle ? String(rawTitle).trim() : "";
      const description = rawDescription ? String(rawDescription).trim() : "";
      const level = rawLevel ? String(rawLevel).toLowerCase().trim() : "";

      if (!studentId && !rollNo) {
        return res.status(400).json({ message: "studentId or rollNo is required" });
      }
      if (!title) return res.status(400).json({ message: "title is required" });
      if (!description) return res.status(400).json({ message: "description is required" });
      if (!level || !VALID_LEVELS.includes(level)) {
        return res.status(400).json({ message: `level is required and must be one of: ${VALID_LEVELS.join(", ")}` });
      }
      if (!date) return res.status(400).json({ message: "date is required" });

      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      let student = null;
      if (studentId) {
        student = await Student.findById(studentId).select("_id studentName rollNo");
      }
      if (!student && rollNo) {
        student = await Student.findOne({ rollNo }).select("_id studentName rollNo");
      }
      if (!student) {
        return res.status(404).json({ message: "Student not found (check studentId or rollNo)" });
      }

      const finalRollNo = (student.rollNo && String(student.rollNo).trim()) || rollNo;
      const finalStudentName = (student.studentName && String(student.studentName).trim()) || (studentName ? String(studentName).trim() : "");

      const ach = new Achievement({
        studentId: student._id,
        rollNo: finalRollNo,
        studentName: finalStudentName,
        title,
        description,
        category: category || "Academic",
        level,
        awardedBy: awardedBy || "Administration",
        date: parsedDate,
        image: image || null,
        createdBy: req.user ? req.user.id : undefined,
      });

      await ach.save();

      return res.status(201).json({ message: "Achievement saved", achievement: ach });
    } catch (err) {
      console.error("Error saving achievement:", err);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: "Server error", error: err.message || err.toString() });
    }
  }
);


/**
 * GET /api/achievements
 * Admin listing with optional pagination: ?page=1&limit=20
 */
router.get("/", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, achievements] = await Promise.all([
      Achievement.countDocuments(),
      Achievement.find()
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "studentId", select: "studentName rollNo year blockName" }),
    ]);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      achievements,
    });
  } catch (err) {
    console.error("Error listing achievements:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get achievements by rollNo
 */
router.get("/by-roll/:rollNo", auth, roleCheck(["admin", "Student", "Staff"]), async (req, res) => {
  try {
    const rollNo = String(req.params.rollNo || "").trim();
    if (!rollNo) return res.status(400).json({ message: "rollNo required" });

    const achievements = await Achievement.find({ rollNo }).sort({ date: -1 }).lean();
    return res.json(achievements);
  } catch (err) {
    console.error("Error fetching achievements by rollNo:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get achievements by studentId
 */
router.get("/by-student/:studentId", auth, roleCheck(["admin", "Student", "Staff"]), async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (!studentId) return res.status(400).json({ message: "studentId required" });

    const achievements = await Achievement.find({ studentId }).sort({ date: -1 }).lean();
    return res.json(achievements);
  } catch (err) {
    console.error("Error fetching achievements by studentId:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
