const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const upload = require("../middleware/upload");
const { auth, roleCheck } = require("../middleware/auth");
const uploadFaceImages = require("../middleware/uploadFaceImages");

// ✅ GET all students
router.get("/", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const students = await Student.find();
    return res.json(students);
  } catch (err) {
    console.error("Error fetching students:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ POST - Upload multiple students
router.post("/upload", auth, roleCheck(["admin"]), async (req, res) => {
  console.log("student", req.body);
  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: "No students to upload" });
    }

    const mappedStudents = students.map((s) => ({
      collegeName: s["College Name"],
      studentName: s["Student Name"],
      gender: s["Gender"],
      rollNo: s["Roll No"],
      //year: Number(s['Year']),
      year: s["Year"],
      roomNo: s["Room No"],
      blockName: s["Block Name"],
    }));

    await Student.insertMany(mappedStudents);

    return res.status(200).json({ message: "Students uploaded successfully" });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ PATCH - Update student by ID
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
        isCompleted: req.body.isCompleted === "true", // ✅ Added
      };

      if (req.files && req.files.length > 0) {
        updateData.faceImages = req.files.map(
          (file) => `/uploads/faces/${req.body.rollNo}/${file.filename}`
        );
      }

      const updatedStudent = await Student.findByIdAndUpdate(
        req.params.id,
        updateData,
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

router.get(
  "/filter",
  auth,
  roleCheck(["admin", "Warden"]),
  async (req, res) => {
    const { block } = req.query;
    console.log("block", block);

    try {
      const students = await Student.find({ blockName: block });
      console.log("students", students);
      res.json(students);
    } catch (err) {
      console.error("Error fetching students by block:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

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

module.exports = router;
