// routes/leave.js
const express = require("express");
const mongoose = require("mongoose");
const Leave = require("../models/LeaveApplication");
const Student = require("../models/Student");
const { auth, roleCheck } = require("../middleware/auth");
const router = express.Router();
const Attendance = require("../models/Attendance");

const ymd = (d) => {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10); // "YYYY-MM-DD"
};

const eachDayInclusive = (from, to) => {
  const days = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
};

// IMPORTANT: Treat approved leave as Absent but flag it
async function applyApprovedLeaveToAttendance(leaveDoc, studentDoc) {
  const rangeDays = eachDayInclusive(leaveDoc.fromDate, leaveDoc.toDate);

  const ops = rangeDays.map((d) => {
    const dateStr = ymd(d);
    return {
      updateOne: {
        filter: { studentId: leaveDoc.student, date: dateStr },
        update: {
          $setOnInsert: { studentId: leaveDoc.student, date: dateStr },
          $set: {
            studentName: studentDoc?.studentName,
            roomNo:      studentDoc?.roomNo,
            rollNo:      studentDoc?.rollNo,
            blockName:   studentDoc?.blockName,

            // your policy: leave days count as Absent
            status: "Absent",
            isApprovedLeave: true,

            leaveId:     leaveDoc._id,
            leaveType:   leaveDoc.leaveType,
            leaveReason: leaveDoc.reason,
            timestamp:   new Date(),
          },
        },
        upsert: true,
      },
    };
  });

  if (!ops.length) return;
  const result = await Attendance.bulkWrite(ops, { ordered: false, bypassDocumentValidation: false });
  console.log("[LEAVE→ATT] bulkWrite result:", result);
}



/** -------- studentAuthByRollNo (no JWT) -------- */
async function studentAuthByRollNo(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
    const rollNo = (req.headers["x-rollno"] || bearer || "").trim();

    if (!rollNo) return res.status(401).json({ message: "Missing rollNo" });

    const student = await Student.findOne({ rollNo });
    if (!student) return res.status(401).json({ message: "Invalid rollNo" });

    req.user = { _id: student._id, role: "student", rollNo };
    next();
  } catch (e) {
    return res.status(401).json({ message: "Auth failed" });
  }
}

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };

/** ========== STUDENT ENDPOINTS ========== */
// POST /api/leave/apply
router.post("/apply", studentAuthByRollNo, async (req, res) => {
  try {
    const { fromDate, toDate, reason, leaveType } = req.body;
    if (!fromDate || !toDate || !reason || !leaveType) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (start < today)
      return res.status(400).json({ message: "Cannot select past dates" });

    const doc = await Leave.create({
      student: req.user._id,
      fromDate: start,
      toDate: end,
      reason: String(reason).trim(),
      leaveType,
    });

    return res
      .status(201)
      .json({ message: "Leave application submitted", leave: doc });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// GET /api/leave/mine
router.get("/mine", studentAuthByRollNo, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { student: req.user._id };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Leave.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Leave.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

// PATCH /api/leave/:id/cancel
router.patch("/:id/cancel", studentAuthByRollNo, async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await Leave.findOne({ _id: id, student: req.user._id });
    if (!leave) return res.status(404).json({ message: "Leave not found" });
    if (leave.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending leaves can be cancelled" });
    }
    leave.status = "cancelled";
    await leave.save();
    res.json({ message: "Leave cancelled", leave });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/** ========== WARDEN/ADMIN ENDPOINTS ========== */

// GET /api/leave?status=&page=&limit=&student=
router.get("/", auth, roleCheck(["Warden", "Admin"]), async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "pending", student } = req.query;

    const filter = {};
    if (status) filter.status = String(status).trim();
    if (student) filter.student = student;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Leave.find(filter)
        // 👇 include year here
        .populate(
          "student",
          "studentName rollNo year blockName collegeName email"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Leave.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

// DEBUG once to prove populated doc contents
router.get(
  "/_debug-one",
  auth,
  roleCheck(["Warden", "Admin"]),
  async (req, res) => {
    const doc = await Leave.findOne({})
      .populate({
        path: "student",
        model: "Student",
        select: "studentName rollNo year blockName",
      })
      .lean();
    console.log("DEBUG populated student =", doc?.student);
    res.json(doc || {});
  }
);

// PATCH /api/leave/:id/decision
// PATCH /api/leave/:id/decision
router.patch("/:id/decision", auth, roleCheck(["Warden", "Admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;

    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave not found" });
    if (leave.status !== "pending") return res.status(400).json({ message: "Leave already processed" });

    if (action === "approve") leave.status = "approved";
    else if (action === "reject") leave.status = "rejected";
    else return res.status(400).json({ message: "Invalid action" });

    leave.decision = { by: req.user._id, at: new Date(), comment: comment?.trim() };
    await leave.save();

    if (leave.status === "approved") {
      try {
        const studentDoc = await Student.findById(leave.student).lean();
        await applyApprovedLeaveToAttendance(leave, studentDoc); // <-- this updates Attendance for each day
      } catch (e) {
        console.error("[LEAVE→ATT] Failed apply for", leave._id, e);
      }
    }

    res.json({ message: `Leave ${leave.status}`, leave });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

router.post("/:id/force-sync", auth, roleCheck(["Warden","Admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave not found" });
    if (leave.status !== "approved") {
      return res.status(400).json({ message: "Leave is not approved; nothing to sync." });
    }
    const studentDoc = await Student.findById(leave.student).lean();
    await applyApprovedLeaveToAttendance(leave, studentDoc);
    res.json({ message: "Synced approved leave into Attendance." });
  } catch (e) {
    console.error("force-sync error:", e);
    res.status(500).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
