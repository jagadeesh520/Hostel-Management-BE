const express = require("express");
const router = express.Router();
const fs = require("fs"); // <-- Add this
const csv = require("csv-parser"); // if using csv-parser
const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const upload = require("../middleware/upload");
const { auth, roleCheck } = require("../middleware/auth");
const uploadFaceImages = require("../middleware/uploadFaceImages");
const User = require("../models/User");

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
      address: s["Address"] || "",       // New field
      studentPhone: s["Student Phone"] || "", // New field
      parentPhone: s["Parent Phone"] || "",   // New field
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


router.post("/bulk-upload-students", upload.single("file"), async (req, res) => {
  console.log("welcome",req)
  if (!req.file) return res.status(400).json({ message: "CSV file is required" });

  const fileRows = []; // JS array, no type annotations

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => fileRows.push(row))
    .on("end", async () => {
      try {
        // Map rows to User objects with hashed passwords
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

        // Remove temp CSV file
        fs.unlinkSync(req.file.path);

        res.status(200).json({ message: "Bulk upload successful", count: users.length });
      } catch (err) {
        console.error("Bulk upload error:", err);
        res.status(500).json({ error: err.message });
      }
    })
    .on("error", (err) => {
      console.error("CSV parse error:", err);
      res.status(500).json({ error: "Failed to parse CSV" });
    });
});

module.exports = router;
