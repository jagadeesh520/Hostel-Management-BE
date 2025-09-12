// routes/challans.js
const express = require('express');
const router = express.Router();
const Challan = require('../models/Challan');

// If you have a hostelOffice auth middleware, require it and uncomment usage below:
// const hostelOfficeAuth = require('../middleware/hostelOfficeAuth');

//
// GET /api/challans
// Query params: status, rollNo, limit, skip
//
router.get('/', /*hostelOfficeAuth,*/ async (req, res) => {
  try {
    const { status, rollNo } = req.query;
    const limit = Math.min(1000, parseInt(req.query.limit || '200', 10));
    const skip = parseInt(req.query.skip || '0', 10);

    const q = {};
    if (status) q.status = status;
    if (rollNo) q.rollNo = String(rollNo).trim();

    const docs = await Challan.find(q).sort({ createdAt: -1 }).limit(limit).skip(skip).lean();
    return res.json(docs);
  } catch (err) {
    console.error('GET /api/challans error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

//
// GET /api/challans/:id
//
router.get('/:id', /*hostelOfficeAuth,*/ async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Challan.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Challan not found' });
    return res.json(doc);
  } catch (err) {
    console.error('GET /api/challans/:id error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

//
// PATCH /api/challans/:id  -> update parsed fields (student)
//
router.patch('/:id', /*optionalAuth,*/ async (req, res) => {
  try {
    const id = req.params.id;
    const { fields } = req.body || {};

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'Missing fields payload' });
    }
    if (!fields.refNo || String(fields.refNo).trim().length === 0) {
      return res.status(400).json({ error: 'refNo is required in fields' });
    }

    const doc = await Challan.findById(id);
    if (!doc) return res.status(404).json({ error: 'Challan not found' });

    doc.fields = { ...(doc.fields || {}), ...fields };
    if (fields.refNo) doc.refNo = String(fields.refNo).toUpperCase().trim();
    if (fields.rollNo) doc.rollNo = fields.rollNo;

    await doc.save();

    return res.json({ ok: true, id: doc._id, fields: doc.fields, status: doc.status });
  } catch (err) {
    console.error('PATCH /api/challans/:id error', err);
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate refNo' });
    }
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

//
// PATCH /api/challans/:id/approve  -> mark approved by hostelOffice
//
router.patch('/:id/approve', /*hostelOfficeAuth,*/ async (req, res) => {
  try {
    const id = req.params.id;
    const approver = (req.hostelOffice && req.hostelOffice._id) ? req.hostelOffice._id : undefined;
    const approverName = (req.hostelOffice && req.hostelOffice.username) ? req.hostelOffice.username : undefined;

    const update = {
      status: 'approved',
      approvedAt: new Date(),
    };
    if (approver) update.approvedBy = approver;
    // if you want to keep approverName in fields for quick audit:
    if (approverName) update['fields.__approvedByName'] = approverName;

    const doc = await Challan.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Challan not found' });

    return res.json({ ok: true, id: doc._id, status: doc.status, approvedAt: doc.approvedAt, fields: doc.fields });
  } catch (err) {
    console.error('PATCH /api/challans/:id/approve error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = {};
    if (status) q.status = status;

    // ideally stream with a cursor for large data
    const cursor = Challan.find(q).cursor();

    // set headers to force download
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="challans_${status || 'all'}_${ts}.csv"`);

    // write CSV header
    const headers = [
      'RefNo','RollNo','StudentName','FatherName','Course','Branch','YearOfStudy',
      'Category','Amount','NoOfMonths','MonthlyMessFee','Mobile','Email','Status','UploadedAt','ApprovedAt'
    ];
    res.write(headers.join(',') + '\n');

    // function to escape
    const esc = (v) => {
      if (v === undefined || v === null) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    for await (const doc of cursor) {
      const f = doc.fields || {};
      const row = [
        doc.refNo || f.refNo || '',
        doc.rollNo || f.rollNo || '',
        f.studentName || '',
        f.fatherName || '',
        f.course || '',
        f.branch || '',
        f.yearOfStudy || '',
        f.category || '',
        f.amount || '',
        f.noOfMonths || '',
        f.monthlyMessFee || '',
        f.mobile || '',
        f.email || '',
        doc.status || '',
        doc.createdAt ? (new Date(doc.createdAt)).toISOString() : '',
        doc.approvedAt ? (new Date(doc.approvedAt)).toISOString() : ''
      ];
      res.write(row.map(esc).join(',') + '\n');
    }

    res.end();
  } catch (err) {
    console.error('Export CSV error', err);
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});


module.exports = router;
