// routes/dues.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const StudentDue = require('../models/StudentDue');
const Student = require('../models/Student');

const upload = multer({ storage: multer.memoryStorage() });

// helper to parse numbers safely, handle commas/currency
function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[,₹\$]/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// Safer Normalize headers to expected fields
function mapRowToDue(row) {
  const mapKey = key => key.toString().toLowerCase().replace(/[\s._-]/g, '');
  const out = {
    rollNo: '',
    studentName: '',
    messDue: 0,
    estDue: 0,
    totalDue: 0
  };

  for (const k of Object.keys(row)) {
    const kk = mapKey(k);
    const val = row[k];

    if (/^(roll|admission|admissionno|admissionno)$/.test(kk) && !out.rollNo) {
      out.rollNo = String(val || '').trim();
      continue;
    }

    if (/^(studentname|student|name)$/.test(kk) && !out.studentName) {
      const s = String(val || '').trim();
      if (s) out.studentName = s;
      continue;
    }

    if (/^(mess|messdue|messdues|mess-dues)$/.test(kk) && !out.messDue) {
      const n = parseNumber(val);
      if (n) out.messDue = n;
      continue;
    }

    if (/^(est|estab|estabdue|fees|estdued|estabdues)$/.test(kk) && !out.estDue) {
      const n = parseNumber(val);
      if (n) out.estDue = n;
      continue;
    }

    if (/^(total|totaldue)$/.test(kk) && !out.totalDue) {
      const n = parseNumber(val);
      if (n) out.totalDue = n;
      continue;
    }
  }

  out.messDue = Number.isFinite(out.messDue) ? out.messDue : 0;
  out.estDue = Number.isFinite(out.estDue) ? out.estDue : 0;
  out.totalDue = (out.totalDue && out.totalDue > 0) ? out.totalDue : (out.messDue + out.estDue);

  return out;
}

// ---------------------------------
// POST /api/dues/upload
// ---------------------------------
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const force = String(req.query.force || 'false').toLowerCase() === 'true';
    const uploader = (req.user && (req.user.email || req.user.id)) || (req.body.uploader || null);

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'No rows found in file' });

    // Deduplicate rows by rollNo (last non-empty wins)
    const rowMap = new Map();
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped = mapRowToDue(raw);
      if (!mapped.rollNo) {
        errors.push({ row: i + 1, reason: 'missing rollNo' });
        continue;
      }
      const norm = String(mapped.rollNo).trim().toUpperCase();
      const existing = rowMap.get(norm) || { rollNo: norm, studentName: '', messDue: 0, estDue: 0, totalDue: 0 };
      if (mapped.studentName && mapped.studentName.toString().trim()) existing.studentName = String(mapped.studentName).trim();
      if (mapped.messDue && Number(mapped.messDue) > 0) existing.messDue = Number(mapped.messDue);
      if (mapped.estDue && Number(mapped.estDue) > 0) existing.estDue = Number(mapped.estDue);
      if (mapped.totalDue && Number(mapped.totalDue) > 0) existing.totalDue = Number(mapped.totalDue);
      rowMap.set(norm, existing);
    }

    if (rowMap.size === 0) return res.status(400).json({ error: 'No valid rows to insert', errors });

    const now = new Date();
    const processed = [];

    for (const [rollNo, mapped] of rowMap.entries()) {
      try {
        let name = (mapped.studentName && mapped.studentName.toString().trim()) ? mapped.studentName.toString().trim() : '';

        if (!name) {
          const studentMaster = await Student.findOne({ rollNo }).select('name fullName studentName').lean().exec();
          if (studentMaster) {
            name = (studentMaster.name || studentMaster.fullName || studentMaster.studentName || '').toString().trim();
          }
        }

        const incomingMess = Math.max(0, Number(mapped.messDue || 0));
        const incomingEst = Math.max(0, Number(mapped.estDue || 0));
        const incomingTotal = Math.max(0, Number(mapped.totalDue || (incomingMess + incomingEst)));

        let sd = await StudentDue.findOne({ rollNo }).exec();

        if (!sd) {
          const doc = new StudentDue({
            rollNo,
            studentName: name || '',
            messDue: incomingMess,
            estDue: incomingEst,
            totalDue: incomingTotal,
            credit: 0,
            lastUploadBy: uploader,
            lastUploadAt: now,
            paymentLogs: [{
              createdAt: now,
              status: 'pending',
              beforeEstDue: incomingEst,
              beforeMessDue: incomingMess,
              amount: 0,
              amtPaidEst: 0,
              amtPaidMess: 0,
              afterTotalDue: incomingTotal,
              studentName: name || '',
              refNo: ''
            }]
          });
          await doc.save();
          processed.push({ rollNo, action: 'inserted', studentName: doc.studentName });
        } else {
          const beforeEst = Number(sd.estDue || 0);
          const beforeMess = Number(sd.messDue || 0);

          if (name && name.trim()) sd.studentName = name.trim();
          sd.lastUploadBy = uploader;
          sd.lastUploadAt = now;

          if (force) {
            sd.messDue = incomingMess;
            sd.estDue = incomingEst;
            sd.totalDue = incomingTotal;
          } else {
            if (!sd.messDue || Number(sd.messDue) === 0) sd.messDue = incomingMess;
            if (!sd.estDue || Number(sd.estDue) === 0) sd.estDue = incomingEst;
            sd.totalDue = Number(sd.messDue || 0) + Number(sd.estDue || 0);
          }

          sd.paymentLogs = sd.paymentLogs || [];
          sd.paymentLogs.push({
            createdAt: now,
            status: 'pending',
            beforeEstDue: beforeEst,
            beforeMessDue: beforeMess,
            amount: 0,
            amtPaidEst: 0,
            amtPaidMess: 0,
            afterTotalDue: Number(sd.totalDue || 0),
            studentName: sd.studentName || name || '',
            refNo: ''
          });

          await sd.save();
          processed.push({ rollNo, action: 'updated', studentName: sd.studentName });
        }
      } catch (e) {
        console.warn('error for roll', rollNo, e && (e.message || e));
        errors.push({ rollNo, reason: e && (e.message || String(e)) });
      }
    }

    return res.json({
      success: true,
      message: 'File processed',
      processedCount: processed.length,
      processed,
      errors
    });
  } catch (err) {
    console.error('dues upload error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/dues  (JSON single or bulk)
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];

    const ops = [];
    const errors = [];
    items.forEach((item, i) => {
      const mapped = {
        rollNo: (item.rollNo || item.AdmissionNo || item['Admission.No'] || item['Admission No'] || '').toString().trim().toUpperCase(),
        studentName: item.studentName || item.Name || '',
        messDue: parseNumber(item.messDue || item['Mess-Dues'] || item['Mess Dues']),
        estDue: parseNumber(item.estDue || item['Estab-Dues'] || item['Estab Dues'] || item.Fees),
      };
      mapped.totalDue = item.totalDue ? parseNumber(item.totalDue) : (mapped.messDue + mapped.estDue);

      if (!mapped.rollNo) {
        errors.push({ index: i, reason: 'missing rollNo' });
      } else {
        ops.push({
          updateOne: {
            filter: { rollNo: mapped.rollNo },
            update: {
              $set: {
                studentName: mapped.studentName,
                messDue: mapped.messDue,
                estDue: mapped.estDue,
                totalDue: mapped.totalDue,
                updatedAt: new Date(),
              }
            },
            upsert: true
          }
        });
      }
    });

    if (!ops.length) {
      return res.status(400).json({ error: 'No valid items to upsert', errors });
    }

    const result = await StudentDue.bulkWrite(ops);
    return res.json({ success: true, bulkResult: result, errors });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/dues - fetch all (be careful in production)
router.get('/', async (req, res) => {
  try {
    const docs = await StudentDue.find().sort({ rollNo: 1 }).lean();
    res.json(docs);
  } catch (err) {
    console.error('GET /api/dues error', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// HELPERS for logs endpoints
// -----------------------------
function flattenDocsToRows(docs) {
  const rows = [];
  docs.forEach(doc => {
    const base = {
      rollNo: doc.rollNo || '',
      studentName: doc.studentName || '',
      messDue: Number(doc.messDue || 0),
      estDue: Number(doc.estDue || 0),
      totalDue: Number(doc.totalDue || 0),
      credit: Number(doc.credit || 0),
      lastUploadBy: doc.lastUploadBy || '',
      lastUploadAt: doc.lastUploadAt ? new Date(doc.lastUploadAt).toISOString() : '',
      docId: (doc._id || '').toString()
    };

    const logs = Array.isArray(doc.paymentLogs) && doc.paymentLogs.length ? doc.paymentLogs : [{
      createdAt: doc.lastUploadAt || null,
      status: '',
      beforeEstDue: doc.estDue || 0,
      beforeMessDue: doc.messDue || 0,
      amount: 0,
      amtPaidEst: 0,
      amtPaidMess: 0,
      afterTotalDue: doc.totalDue || 0,
      refNo: '',
      note: '',
      challanId: '',
      appliedAt: null
    }];

    logs.forEach(log => {
      rows.push({
        rollNo: base.rollNo,
        studentName: (log.studentName || base.studentName || '').toString(),
        docId: base.docId,
        logId: (log._id || '').toString(),
        refNo: log.refNo || '',
        challanId: (log.challanId || '').toString(),
        status: (log.status || '').toString(),
        createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : '',
        appliedAt: log.appliedAt ? new Date(log.appliedAt).toISOString() : '',
        beforeEstDue: Number(log.beforeEstDue || 0),
        beforeMessDue: Number(log.beforeMessDue || 0),
        amtPaidEst: Number(log.amtPaidEst || 0),
        amtPaidMess: Number(log.amtPaidMess || 0),
        amount: Number(log.amount || 0),
        afterTotalDue: Number(log.afterTotalDue || 0),
        messDue: base.messDue,
        estDue: base.estDue,
        totalDue: base.totalDue,
        credit: base.credit,
        lastUploadBy: base.lastUploadBy,
        lastUploadAt: base.lastUploadAt,
        note: log.note || ''
      });
    });
  });
  return rows;
}

// safe date parser - returns Date or null
function parseDateParam(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  const isoLike = /^\d{4}-\d{1,2}-\d{1,2}$/;
  if (isoLike.test(s)) {
    const parts = s.split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    if (!isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt;
  return null;
}

// -----------------------------
// GET /api/dues/logs - returns flattened payment logs
// -----------------------------
router.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const rawPageSize = Number(req.query.pageSize) || 200;
    const pageSize = Math.min(500, Math.max(10, rawPageSize));
    const skip = (page - 1) * pageSize;

    const rollNo = req.query.rollNo ? String(req.query.rollNo).trim().toUpperCase() : null;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const createdStart = parseDateParam(req.query.createdStartDate);
    const createdEnd = parseDateParam(req.query.createdEndDate);
    const appliedStart = parseDateParam(req.query.appliedStartDate);
    const appliedEnd = parseDateParam(req.query.appliedEndDate);

    const normalizeEnd = d => {
      if (!d) return null;
      const nd = new Date(d);
      nd.setHours(23, 59, 59, 999);
      return nd;
    };

    const createdEndNorm = normalizeEnd(createdEnd);
    const appliedEndNorm = normalizeEnd(appliedEnd);

    console.log('[DuesLogs] query', { page, pageSize, rollNo, status, createdStart, createdEndNorm, appliedStart, appliedEndNorm });

    const match = {};
    if (rollNo) match.rollNo = rollNo;

    const pipeline = [
      { $match: match },
      { $unwind: { path: "$paymentLogs", preserveNullAndEmptyArrays: true } }
    ];

    if (status) {
      pipeline.push({ $match: { "paymentLogs.status": status } });
    }

    if (createdStart || createdEndNorm) {
      const cMatch = {};
      if (createdStart) cMatch.$gte = createdStart;
      if (createdEndNorm) cMatch.$lte = createdEndNorm;
      pipeline.push({ $match: { "paymentLogs.createdAt": cMatch } });
    }

    if (appliedStart || appliedEndNorm) {
      const aMatch = {};
      if (appliedStart) aMatch.$gte = appliedStart;
      if (appliedEndNorm) aMatch.$lte = appliedEndNorm;
      pipeline.push({ $match: { "paymentLogs.appliedAt": aMatch } });
    }

    pipeline.push(
      { $sort: { "paymentLogs.createdAt": -1 } },
      {
        $project: {
          _id: "$paymentLogs._id",
          createdAt: "$paymentLogs.createdAt",
          appliedAt: "$paymentLogs.appliedAt",
          status: "$paymentLogs.status",
          studentName: { $ifNull: ["$paymentLogs.studentName", "$studentName"] },
          rollNo: "$rollNo",
          beforeEstDue: "$paymentLogs.beforeEstDue",
          beforeMessDue: "$paymentLogs.beforeMessDue",
          amtPaidEst: "$paymentLogs.amtPaidEst",
          amtPaidMess: "$paymentLogs.amtPaidMess",
          afterTotalDue: "$paymentLogs.afterTotalDue",
          amount: "$paymentLogs.amount",
          refNo: "$paymentLogs.refNo",
          challanId: "$paymentLogs.challanId",
          note: "$paymentLogs.note"
        }
      },
      { $skip: skip },
      { $limit: pageSize }
    );

    const countPipeline = [
      { $match: match },
      { $unwind: { path: "$paymentLogs", preserveNullAndEmptyArrays: true } }
    ];
    if (status) countPipeline.push({ $match: { "paymentLogs.status": status } });
    if (createdStart || createdEndNorm) {
      const cMatch = {};
      if (createdStart) cMatch.$gte = createdStart;
      if (createdEndNorm) cMatch.$lte = createdEndNorm;
      countPipeline.push({ $match: { "paymentLogs.createdAt": cMatch } });
    }
    if (appliedStart || appliedEndNorm) {
      const aMatch = {};
      if (appliedStart) aMatch.$gte = appliedStart;
      if (appliedEndNorm) aMatch.$lte = appliedEndNorm;
      countPipeline.push({ $match: { "paymentLogs.appliedAt": aMatch } });
    }
    countPipeline.push({ $count: "total" });

    const [data, countRes] = await Promise.all([
      StudentDue.aggregate(pipeline).allowDiskUse(true).exec(),
      StudentDue.aggregate(countPipeline).exec()
    ]);

    const total = (countRes && countRes[0] && countRes[0].total) ? countRes[0].total : 0;

    const rows = (data || []).map(d => ({
      logId: d._id ? d._id.toString() : '',
      rollNo: d.rollNo || '',
      studentName: d.studentName || '',
      refNo: d.refNo || '',
      challanId: d.challanId || '',
      status: d.status || '',
      createdAt: d.createdAt || '',
      appliedAt: d.appliedAt || '',
      beforeEstDue: Number(d.beforeEstDue || 0),
      beforeMessDue: Number(d.beforeMessDue || 0),
      amtPaidEst: Number(d.amtPaidEst || 0),
      amtPaidMess: Number(d.amtPaidMess || 0),
      amount: Number(d.amount || 0),
      afterTotalDue: Number(d.afterTotalDue || 0),
      note: d.note || ''
    }));

    // Return shape expected by frontend: { data: [...], total, page, pageSize }
    return res.json({ data: rows, total, page, pageSize });
  } catch (err) {
    console.error('dues logs error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// -----------------------------
// GET /api/dues/logs/export
// -----------------------------
router.get('/logs/export', async (req, res) => {
  try {
    const rollNo = req.query.rollNo ? String(req.query.rollNo).trim().toUpperCase() : null;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const createdStart = parseDateParam(req.query.createdStartDate);
    const createdEnd = parseDateParam(req.query.createdEndDate);
    const appliedStart = parseDateParam(req.query.appliedStartDate);
    const appliedEnd = parseDateParam(req.query.appliedEndDate);

    const normalizeEnd = d => { if (!d) return null; const nd = new Date(d); nd.setHours(23,59,59,999); return nd; };
    const createdEndNorm = normalizeEnd(createdEnd);
    const appliedEndNorm = normalizeEnd(appliedEnd);

    const match = {};
    if (rollNo) match.rollNo = rollNo;

    const docs = await StudentDue.find(match).sort({ rollNo: 1 }).lean().exec();
    let rows = flattenDocsToRows(docs);

    if (status) {
      rows = rows.filter(r => (r.status || '').toString().toLowerCase() === status);
    }

    if (createdStart || createdEndNorm) {
      rows = rows.filter(r => {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt);
        if (createdStart && d < createdStart) return false;
        if (createdEndNorm && d > createdEndNorm) return false;
        return true;
      });
    }

    if (appliedStart || appliedEndNorm) {
      rows = rows.filter(r => {
        if (!r.appliedAt) return false;
        const d = new Date(r.appliedAt);
        if (appliedStart && d < appliedStart) return false;
        if (appliedEndNorm && d > appliedEndNorm) return false;
        return true;
      });
    }

    const sheetData = rows.map(r => ({
      RollNo: r.rollNo,
      StudentName: r.studentName,
      DocId: r.docId,
      LogId: r.logId,
      RefNo: r.refNo,
      ChallanId: r.challanId,
      Status: r.status,
      LogCreatedAt: r.createdAt,
      LogAppliedAt: r.appliedAt,
      BeforeEstDue: r.beforeEstDue,
      BeforeMessDue: r.beforeMessDue,
      AmtPaidEst: r.amtPaidEst,
      AmtPaidMess: r.amtPaidMess,
      Amount: r.amount,
      AfterTotalDue: r.afterTotalDue,
      MessDue: r.messDue,
      EstDue: r.estDue,
      TotalDue: r.totalDue,
      Credit: r.credit,
      LastUploadBy: r.lastUploadBy,
      LastUploadAt: r.lastUploadAt,
      Note: r.note
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(sheetData);
    xlsx.utils.book_append_sheet(wb, ws, 'DuesLogs');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `dues-logs-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (err) {
    console.error('dues logs export error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// -----------------------------
// GET /api/dues/:idOrRoll  (fallback route - keep LAST)
// -----------------------------
router.get('/:idOrRoll', async (req, res) => {
  try {
    const idOrRollRaw = String(req.params.idOrRoll || '').trim();
    if (!idOrRollRaw) return res.status(400).json({ success: false, error: 'Missing id or rollNo' });

    const includeLogs = String(req.query.logs || 'true').toLowerCase() === 'true';

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    console.log('[GET /api/dues/:idOrRoll] requested:', idOrRollRaw, 'includeLogs=', includeLogs);

    let query = null;
    if (/^[0-9a-fA-F]{24}$/.test(idOrRollRaw)) {
      query = { _id: idOrRollRaw };
      console.log('[dues] trying _id lookup:', idOrRollRaw);
    }

    const projection = includeLogs ? {} : { paymentLogs: 0 };

    let doc = null;
    if (query) {
      doc = await StudentDue.findOne(query, projection).lean().exec();
    }

    if (!doc) {
      const rollUpper = idOrRollRaw.toUpperCase();
      console.log('[dues] trying rollNo exact lookup:', rollUpper);
      doc = await StudentDue.findOne({ rollNo: rollUpper }, projection).lean().exec();
    }

    if (!doc) {
      const escaped = escapeRegex(idOrRollRaw);
      console.log('[dues] trying rollNo regex lookup (case-insensitive):', escaped);
      doc = await StudentDue.findOne({ rollNo: { $regex: `^${escaped}$`, $options: 'i' } }, projection).lean().exec();
    }

    if (!doc && isNaN(Number(idOrRollRaw)) && idOrRollRaw.length > 2) {
      console.log('[dues] trying name partial match fallback:', idOrRollRaw);
      doc = await StudentDue.findOne({ studentName: { $regex: escapeRegex(idOrRollRaw), $options: 'i' } }, projection).lean().exec();
    }

    if (!doc) {
      const q = idOrRollRaw.length <= 3 ? escapeRegex(idOrRollRaw) : escapeRegex(idOrRollRaw).slice(0, 6);
      const similar = await StudentDue.find({ rollNo: { $regex: q, $options: 'i' } })
        .limit(10)
        .select('rollNo studentName')
        .lean()
        .exec();

      console.warn('[dues] not found:', idOrRollRaw, 'similarCount=', similar.length);

      return res.status(404).json({
        success: false,
        error: 'Student due not found',
        requested: idOrRollRaw,
        suggestions: similar.map(s => ({ rollNo: s.rollNo, studentName: s.studentName }))
      });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error('GET /api/dues/:idOrRoll error', err && (err.stack || err.message || err));
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

module.exports = router;
