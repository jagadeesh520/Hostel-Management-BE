// routes/timesheet.js
const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance')

// GET /api/timesheet/:rollNo
// routes/timesheet.js
// GET /api/timesheetRoutes/:rollNo
router.get('/:rollNo', async (req, res) => {
  try {
    const rollNo = String(req.params.rollNo).trim();

    // Query directly by rollNo
    const records = await Attendance.find({ rollNo })
      .select('date status isApprovedLeave')
      .lean();

    if (!records.length) {
      return res.json({
        absentDates: [],
        approvedLeaveDates: [],
        presentDates: [],
      });
    }

    const presentDates = [];
    const absentDates = [];
    const approvedLeaveDates = [];

    for (const rec of records) {
      // date is already stored as "YYYY-MM-DD"
      const d = rec.date;

      if (rec.status === 'Present') {
        presentDates.push(d);
      } else if (rec.status === 'Absent') {
        if (rec.isApprovedLeave) approvedLeaveDates.push(d);
        else absentDates.push(d);
      }
    }

    res.json({ absentDates, approvedLeaveDates, presentDates });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});









// ✅ Apply for leave
/* router.post('/leave', auth, async (req, res) => {
  const { fromDate, toDate, reason } = req.body;
  const studentId = req.user._id;

  const start = new Date(fromDate);
  const end = new Date(toDate);

  const days = [];
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const leaves = await Promise.all(days.map(date =>
    Timesheet.findOneAndUpdate(
      { studentId, date },
      {
        studentId,
        date,
        status: 'Leave',
        leaveReason: reason,
        leaveStatus: 'Pending'
      },
      { upsert: true, new: true }
    )
  ));

  res.json({ message: 'Leave request submitted', leaves });
}); */

module.exports = router;
