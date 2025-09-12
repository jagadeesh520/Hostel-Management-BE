// routes/billing.js
const express = require('express');
const router = express.Router();
const StudentDue = require('../models/StudentDue');
const { billStudentForMonth } = require('../services/billing');

// --- Replace this with your real auth/admin middleware ---
function ensureAdmin(req, res, next) {
  // Example: if you use req.user and roles:
  // if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'forbidden' });
  // For now allow if env DEBUG_ADMIN=true (development)
  if (process.env.DEBUG_ADMIN === 'true') return next();
  // fallback: simple header check (replace with your auth)
  if (req.headers['x-admin-secret'] === process.env.ADMIN_SECRET) return next();
  return res.status(403).json({ error: 'admin access required' });
}
// -------------------------------------------------------

// POST /api/dues/bill-student
// body: { rollNo: string, month: number, year: number, dryRun?: boolean, performedBy?: string, reason?: string }
router.post('/bill-student', ensureAdmin, async (req, res) => {
  try {
    const { rollNo, month, year, dryRun = false, performedBy, reason } = req.body || {};
    if (!rollNo || !month || !year) {
      return res.status(400).json({ error: 'rollNo, month and year are required' });
    }

    const result = await billStudentForMonth(String(rollNo).trim().toUpperCase(), Number(month), Number(year), {
      dryRun: !!dryRun,
      performedBy: performedBy || (req.user && (req.user.email || req.user.id)) || 'admin',
      reason: reason || ''
    });

    return res.json({ success: true, result });
  } catch (err) {
    console.error('bill-student error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/dues/bill-month
// body: { month: number, year: number, dryRun?: boolean, batchSize?: number, filter?: { rollNos?: string[] } }
// Example: { month:8, year:2025, dryRun:true }
router.post('/bill-month', ensureAdmin, async (req, res) => {
  try {
    const { month, year, dryRun = false, batchSize = 100, filter } = req.body || {};
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    // Build a query: optionally filter by rollNos (list) or provide other filters later
    const query = {};
    if (filter && Array.isArray(filter.rollNos) && filter.rollNos.length) {
      query.rollNo = { $in: filter.rollNos.map(r => String(r).trim().toUpperCase()) };
    }

    // Cursor iteration in batches
    const cursor = StudentDue.find(query).select('rollNo studentName lastBilledMonth messDue estDue').cursor();

    const summary = { processed: 0, billed: 0, skipped: 0, errors: 0, details: [] };
    let batch = [];
    const processBatch = async (arr) => {
      // execute sequentially to avoid DB connection saturation
      for (const doc of arr) {
        summary.processed++;
        try {
          const r = await billStudentForMonth(doc.rollNo, Number(month), Number(year), {
            dryRun: !!dryRun,
            performedBy: (req.user && (req.user.email || req.user.id)) || 'admin',
            reason: `Bulk billing ${year}-${String(month).padStart(2,'0')}`
          });
          if (r && r.skipped) {
            summary.skipped++;
            summary.details.push({ rollNo: doc.rollNo, status: 'skipped', reason: r.reason || 'already_billed' });
          } else if (r && r.billed) {
            summary.billed++;
            summary.details.push({ rollNo: doc.rollNo, status: 'billed', messBill: r.messBill, estBill: r.estBill, afterTotal: r.afterTotal });
          } else if (r && r.dryRun) {
            summary.details.push({ rollNo: doc.rollNo, status: 'dryRun', messBill: r.messBill, estBill: r.estBill });
          } else {
            summary.details.push({ rollNo: doc.rollNo, status: 'unknown', result: r });
          }
        } catch (err) {
          console.error('billing error for', doc.rollNo, err && (err.message || err));
          summary.errors++;
          summary.details.push({ rollNo: doc.rollNo, status: 'error', error: err && (err.message || String(err)) });
        }
      }
    };

    // iterate and process in batches
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      batch.push(doc);
      if (batch.length >= batchSize) {
        // eslint-disable-next-line no-await-in-loop
        await processBatch(batch);
        batch = [];
      }
    }
    if (batch.length) {
      // eslint-disable-next-line no-await-in-loop
      await processBatch(batch);
    }

    return res.json({ success: true, month, year, dryRun: !!dryRun, summary });
  } catch (err) {
    console.error('bill-month error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
