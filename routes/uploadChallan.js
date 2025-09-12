// routes/uploadChallan.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Challan = require('../models/Challan');
const { pdfBufferToText, parseFieldsFromText } = require('../utils/pdfHelpers');

const router = express.Router();

// Config: allow saving uploads even when parser fails to detect refNo.
// Useful when you want admins to manually review scanned PDFs. Default: false.
const ALLOW_UPLOAD_WITHOUT_REF = process.env.ALLOW_UPLOAD_WITHOUT_REF === 'true';

// Multer storage to disk (simple). Adjust destination as needed.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'challans');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const safe = file.originalname ? file.originalname.replace(/\s+/g, '_') : 'challan.pdf';
    cb(null, `${uniq}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } }); // 30MB

/**
 * POST /api/upload-challan
 * - Expects multipart/form-data with field "file"
 * - Returns: { ok: true, id, fields, status } on success
 * - On duplicate (refNo exists) returns 409 with { error, existingId }
 * - If parser cannot find refNo: default behavior -> 400 error (unless ALLOW_UPLOAD_WITHOUT_REF=true)
 */
router.post('/upload-challan', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const originalName = req.file.originalname || req.file.filename || 'challan.pdf';
    const buffer = fs.readFileSync(filePath);

    // 1) Try extracting text
    let text = '';
    try {
      text = await pdfBufferToText(buffer);
    } catch (e) {
      console.warn('pdfBufferToText failed:', e && e.message);
      text = '';
    }

    // 2) Parse fields (may return empty fields object)
    const fields = parseFieldsFromText(text || '');

    // Canonical refNo for duplicate checks
    const refNoRaw = fields.refNo || null;
    const refNoCanonical = refNoRaw ? String(refNoRaw).toUpperCase().trim() : null;

    // If no refNo found and we do not allow saving without ref -> return 400 with parsed preview
    if (!refNoCanonical) {
      if (!ALLOW_UPLOAD_WITHOUT_REF) {
        // Remove the uploaded file since we will not keep it
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
        return res.status(400).json({
          error: 'Could not detect Reference Number from PDF. Please ensure the document contains SBCollect Reference Number.',
          fields
        });
      }
      // else fallthrough and save with status 'needs_review'
    }

    // 3) Prevent duplicate by refNo (only if we have a refNo)
    if (refNoCanonical) {
      const existing = await Challan.findOne({ refNo: refNoCanonical });
      if (existing) {
        // Remove uploaded file (optional)
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
        return res.status(409).json({
          error: 'Challan with same reference number already exists',
          existingId: existing._id,
          fields: existing.fields || null
        });
      }
    }

    // 4) Save to DB
    const challanDoc = new Challan({
      // Optionally attach authenticated user: uploadedBy: req.user?.id
      rollNo: fields.rollNo || undefined,
      refNo: refNoCanonical || undefined,
      fields: fields,
      filePath: filePath,
      originalName,
      status: refNoCanonical ? 'pending' : 'needs_review' // needs_review when no refNo and ALLOW_UPLOAD_WITHOUT_REF
    });

    await challanDoc.save();

    return res.json({
      ok: true,
      id: challanDoc._id,
      fields: challanDoc.fields,
      status: challanDoc.status,
      message: refNoCanonical ? 'Uploaded and parsed' : 'Uploaded (needs manual review)'
    });
  } catch (err) {
    console.error('Upload-challan error', err);
    // detect duplicate key error (race)
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.refNo) {
      return res.status(409).json({ error: 'Duplicate refNo' });
    }
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/upload-challan/file/:id
 * - Streams the saved PDF file for inspection
 */
router.get('/file/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Challan.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Challan not found' });
    if (!doc.filePath || !fs.existsSync(doc.filePath)) {
      return res.status(404).json({ error: 'Uploaded file not found on server' });
    }
    const filename = doc.originalName || path.basename(doc.filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    const stream = fs.createReadStream(doc.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('GET file error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/upload-challan/by-roll/:rollNo
 * - List challans for a roll number (most recent first)
 * - Useful for student dashboard listing
 */
router.get('/by-roll/:rollNo', async (req, res) => {
  try {
    const roll = req.params.rollNo;
    if (!roll) return res.status(400).json({ error: 'Missing roll number' });
    const docs = await Challan.find({ rollNo: roll }).sort({ createdAt: -1 }).lean();
    return res.json(docs);
  } catch (err) {
    console.error('GET by-roll error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
