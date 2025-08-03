// routes/timesheet.js
const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance')

// GET /api/timesheet/:rollNo
// routes/timesheet.js
router.get('/:rollNo', async (req, res) => {
  try {
    const rollNo = String(req.params.rollNo).trim();
    console.log('Searching for rollNo:', rollNo);

    const allRecords = await Attendance.find({});
    console.log('Total records in DB:', allRecords.length);
    allRecords.forEach(r => console.log(`${r.rollNo} | ${r.status} | ${r.date}`));

    const records = allRecords.filter(r => r.rollNo === rollNo);
    console.log('Filtered records:', records.length);

    if (!records.length) {
      return res.status(200).json({ absentDates: [], presentDates: [] });
    }

    const absentDates = records
      .filter((rec) => rec.status === 'Absent')
      .map((rec) => new Date(rec.date).toISOString().split('T')[0]);

    const presentDates = records
      .filter((rec) => rec.status === 'Present')
      .map((rec) => new Date(rec.date).toISOString().split('T')[0]);

    res.json({ absentDates, presentDates });
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
