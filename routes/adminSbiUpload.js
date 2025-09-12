// routes/adminSbiUpload.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

let parseCsvSync = null;
try {
  parseCsvSync = require('csv-parse/sync').parse;
} catch (err) {
  console.warn('csv-parse/sync not available, fallback parser will be used. For robust parsing: npm i csv-parse', err);
}

let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('pdf-parse not installed; PDF text extraction will not work. Install with: npm i pdf-parse', e && e.message);
}

const Challan = require('../models/Challan');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'sbi_statements');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // allow up to 20MB

function simpleExtractRefsFromText(text) {
  const refs = new Set();
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // first attempt: tokens like DUO2005395 (letters+digits)
    const m = trimmed.match(/\b([A-Z]{2,}\d{3,})\b/i);
    if (m) refs.add(m[1].toUpperCase());
    else {
      // split and try tokens
      const tokens = trimmed.split(/[,\t;|]/).map(t => t.trim()).filter(Boolean);
      for (const t of tokens) {
        const mm = t.match(/\b([A-Z]{2,}\d{3,})\b/i) || t.match(/\b([A-Z0-9\-\/]{5,})\b/i);
        if (mm) { refs.add(mm[1].toUpperCase()); break; }
      }
    }
  }
  return Array.from(refs);
}

/**
 * canonicalizeRef - clean a parsed token into the canonical lookup form
 */
function canonicalizeRef(r) {
  if (!r) return null;
  let s = String(r).replace(/[\u200B-\u200D\uFEFF]/g, ''); // remove zero-width
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/[^A-Za-z0-9\-\/]/g, ''); // keep letters, digits, dash, slash
  s = s.replace(/_/g, '');
  s = s.trim().toUpperCase();
  return s || null;
}

async function textFromPdfBuffer(buffer) {
  if (!pdfParse) {
    throw new Error('pdf-parse not installed');
  }
  // pdf-parse returns { text, numpages, info, ... }
  const data = await pdfParse(buffer);
  return data && data.text ? data.text : '';
}

/**
 * Batch runner with controlled concurrency by slicing into batches.
 * Executes fn for ids in batches of batchSize (default 50).
 */
async function batchProcess(ids, fn, batchSize = 50) {
  const results = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    // run in parallel within slice
    // fn should return a promise
    const settled = await Promise.allSettled(slice.map(id => fn(id)));
    results.push(...settled);
    // small delay could be added if you want, but usually not necessary
  }
  return results;
}

router.post('/upload-sbi-statement', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // read raw buffer for pdf handling
    const buffer = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname || req.file.filename || '').toLowerCase();

    // extract text content depending on file type
    let fileText = '';
    if (ext === '.pdf') {
      try {
        fileText = await textFromPdfBuffer(buffer);
        console.log('PDF extraction: text length =', fileText ? fileText.length : 0);
        if (!fileText || fileText.trim().length === 0) {
          // empty text from pdf-parse -> likely an image-only scanned PDF
          console.warn('PDF parsed but no text found. The PDF might be a scanned image (OCR needed).');
        }
      } catch (pdfErr) {
        console.warn('pdf-parse failed:', pdfErr && pdfErr.message);
        // fallback to attempting to treat as text (rare)
        fileText = buffer.toString('utf8');
      }
    } else {
      // attempt to parse as text/csv
      fileText = buffer.toString('utf8');
    }

    // try CSV parser first (if available and file appears CSV / text)
    let refs = [];
    if (parseCsvSync && ext !== '.pdf') {
      try {
        const records = parseCsvSync(fileText, { skip_empty_lines: true, relax_column_count: true });
        for (const row of records) {
          if (Array.isArray(row)) {
            for (const col of row) {
              if (!col) continue;
              const token = String(col).trim();
              if (!token) continue;
              const m = (token.match(/[A-Z]{2,}\d{3,}/i) || token.match(/[A-Z0-9\-\/]{5,}/i));
              if (m) refs.push(m[0].toUpperCase());
            }
          } else if (row && typeof row === 'object') {
            for (const k of Object.keys(row)) {
              const token = String(row[k]).trim();
              if (!token) continue;
              const m = (token.match(/[A-Z]{2,}\d{3,}/i) || token.match(/[A-Z0-9\-\/]{5,}/i));
              if (m) refs.push(m[0].toUpperCase());
            }
          }
        }
      } catch (csvErr) {
        console.warn('csv-parse failed, falling back to text parse', csvErr && csvErr.message);
        refs = simpleExtractRefsFromText(fileText);
      }
    } else {
      refs = simpleExtractRefsFromText(fileText);
    }

    refs = Array.from(new Set(refs || []));

    // If still nothing from text extraction (particularly for PDFs), provide message
    if (refs.length === 0) {
      // cleanup
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      // Helpful message to frontend: scanned PDF may need OCR
      return res.status(200).json({
        ok: true,
        parsedCount: 0,
        matched: [],
        notFound: [],
        warning: 'No reference tokens found. If you uploaded a scanned PDF (image), run OCR before upload.'
      });
    }

    // canonicalize refs
    const canonicalSet = new Set();
    for (const r of refs) {
      const c = canonicalizeRef(r);
      if (c) canonicalSet.add(c);
    }
    const canonicalRefs = Array.from(canonicalSet);

    console.log('SBI upload parsed refs (raw sample):', refs.slice(0, 80));
    console.log('SBI upload canonical refs (sample):', canonicalRefs.slice(0, 80));

    if (canonicalRefs.length === 0) {
      try { fs.unlinkSync(req.file.path); } catch(e){}
      return res.status(400).json({ error: 'No reference numbers found in uploaded file after normalization' });
    }

    // bulk find
    const foundDocs = await Challan.find({ refNo: { $in: canonicalRefs } }).lean();

    const foundMap = new Map();
    for (const d of foundDocs) {
      if (d && d.refNo) foundMap.set(String(d.refNo).toUpperCase().trim(), d);
    }

    const matched = [];
    const notFound = [];
    const idsToApprove = [];

    for (const ref of canonicalRefs) {
      const doc = foundMap.get(ref);
      if (doc) {
        matched.push({ ref: ref, id: String(doc._id), rollNo: doc.rollNo, status: doc.status || 'pending' });
        if (doc.status !== 'approved') idsToApprove.push(doc._id);
      } else {
        notFound.push(ref);
      }
    }

    if (idsToApprove.length > 0) {
      const now = new Date();

      try {
        // 1) mark them approved in DB
        await Challan.updateMany(
          { _id: { $in: idsToApprove } },
          { $set: { status: 'approved', approvedAt: now } }
        );

        // 2) apply each approved challan to StudentDue using the apply util in batches
        // Lazy-require the util to avoid circular require problems
        const { applyApprovedChallan } = require('../utils/paymentUtils');

        // use batchProcess to avoid flooding DB with thousands of parallel promises
        const settleResults = await batchProcess(idsToApprove, async (id) => {
          try {
            const r = await applyApprovedChallan(id);

            if (!r || r.applied !== true) {
              console.warn(`applyApprovedPayment did not apply for ${id}:`, r && r.reason);
            } else {
              console.log(`applyApprovedPayment succeeded for ${id}`);
            }
            return { id, ok: true, result: r };
          } catch (err) {
            console.error(`applyApprovedPayment failed for ${id}:`, err && (err.stack || err.message || err));
            throw err;
          }
        }, 50);

        // you can inspect settleResults for logging/debugging if needed
        // console.log('apply results sample:', settleResults.slice(0,10));

        // update matched statuses for response payload
        for (const m of matched) {
          if (idsToApprove.some(id => String(id) === String(m.id))) m.status = 'approved';
        }

      } catch (updErr) {
        console.warn('Failed to auto-approve some challans:', updErr && updErr.message);
      }
    }

    // cleanup uploaded file
    try { fs.unlinkSync(req.file.path); } catch(e){}

    return res.json({
      ok: true,
      parsedCount: refs.length,
      canonicalCount: canonicalRefs.length,
      matched,
      notFound
    });
  } catch (err) {
    console.error('SBI upload error', err && err.stack ? err.stack : err);
    try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch(e){}
    return res.status(500).json({ error: 'Server error', details: err.message || String(err) });
  }
});

module.exports = router;
