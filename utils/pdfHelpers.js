// utils/pdfHelpers.js
const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Normalize extracted text: keep meaningful line breaks,
 * preserve sequences of 2+ spaces (used to detect two-column lines).
 */
function normalizeText(t = '') {
  return String(t)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    // collapse many spaces but leave double-spaces as marker for columns
    .replace(/ {3,}/g, '  ')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, '')) // trim right
    .join('\n');
}

/**
 * Helpers: labels mapping and normalization
 */
const LABELS = {
  refNo: ['SBCollect Reference Number', 'SBCollect Reference No', 'REFERENCE NUMBER', 'REF', 'Ref No', 'Reference Number'],
  category: ['Category'],
  amount: ['Amount', 'AMOUNT', 'TOTAL AMOUNT'],
  rollNo: ['ROLL NUMBER', 'ROLL NO', 'Roll Number', 'Roll No'],
  studentName: ['NAME OF THE STUDENT', 'Student Name', 'NAME'],
  fatherName: ['FATHER NAME', 'Father Name', 'FATHER'],
  course: ['COURSE'],
  branch: ['BRANCH'],
  yearOfStudy: ['YEAR OF STUDY', 'YEAR'],
  mobile: ['MOBILE NUMBER', 'MOBILE'],
  email: ['EMAIL ID', 'EMAIL'],
  monthlyMessFee: ['MONTHLY MESS FEE'],
  noOfMonths: ['NO OF MONTHS'],
  transactionCharge: ['Transaction charge', 'TRANSACTION CHARGE']
};

function normalizeLabel(s = '') {
  return String(s).replace(/[:\s]+/g, ' ').trim().toUpperCase();
}

// reverse lookup: normalized label -> key
const labelToKey = {};
Object.keys(LABELS).forEach((k) => {
  LABELS[k].forEach((raw) => {
    labelToKey[normalizeLabel(raw)] = k;
  });
});

function cleanValue(v = '') {
  if (!v && v !== 0) return v;
  let val = String(v).replace(/\s{2,}/g, ' ').trim();

  // Remove accidental trailing label tokens (common OCR merge cases)
  val = val.replace(/\s+(FATHER NAME|NAME OF THE STUDENT|COURSE|MOBILE NUMBER|NO OF MONTHS|MONTHLY MESS FEE|BRANCH|YEAR OF STUDY|FATHER)\s*$/i, '').trim();

  // Convert rupee-like symbols to text
  val = val.replace(//g, 'Rs ').replace(/[₹₹]/g, 'Rs ');
  return val;
}

/**
 * Find label positions in text. Returns array of objects:
 * { labelRaw, labelNorm, lineIndex, valueOnSameLine, valueOnNextLine, rawLine }
 */
function findLabelPositions(text) {
  const lines = text.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    // 1) direct Label : Value on same line
    const colonMatch = line.match(/^(.{2,}?)\s*[:\-]\s*(.+)$/);
    if (colonMatch) {
      const left = colonMatch[1].trim();
      const right = colonMatch[2].trim();
      const leftNorm = normalizeLabel(left);
      if (labelToKey[leftNorm]) {
        out.push({ labelRaw: left, labelNorm: leftNorm, lineIndex: i, rawLine: line, valueOnSameLine: right });
        continue;
      }
    }

    // 2) two-column detection: multiple spaces separate columns
    if (/\s{2,}/.test(lines[i])) {
      const parts = lines[i].split(/ {2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const left = parts[0];
        const right = parts.slice(1).join(' ');
        const leftNorm = normalizeLabel(left);
        if (labelToKey[leftNorm]) {
          out.push({ labelRaw: left, labelNorm: leftNorm, lineIndex: i, rawLine: line, valueOnSameLine: right });
          continue;
        }
      }
    }

    // 3) whole line equals label and value in next line
    const lineNorm = normalizeLabel(line);
    if (labelToKey[lineNorm]) {
      const next = (lines[i + 1] || '').trim();
      out.push({ labelRaw: line, labelNorm: lineNorm, lineIndex: i, rawLine: line, valueOnNextLine: next });
      continue;
    }

    // 4) line contains known label substring (handles slightly noisy OCR)
    for (const variants of Object.values(LABELS)) {
      for (const rawLbl of variants) {
        const pattern = new RegExp(rawLbl.replace(/\s+/g, '\\s+'), 'i');
        if (pattern.test(line)) {
          // attempt to split around the label
          const parts = line.split(new RegExp(rawLbl, 'i'));
          const after = (parts[1] || '').replace(/^[:\-\s]+/, '').trim();
          const leftNorm = normalizeLabel(rawLbl);
          if (labelToKey[leftNorm]) {
            out.push({ labelRaw: rawLbl, labelNorm: leftNorm, lineIndex: i, rawLine: line, valueOnSameLine: after || undefined });
          }
          break;
        }
      }
    }
  }

  return out;
}

/**
 * Primary parsing function: robustly extract fields from text (string).
 * Handles label:value, two-column, and mis-merged suffix tokens.
 */
function parseFieldsFromText(textRaw = '') {
  if (!textRaw) return {};
  const text = normalizeText(textRaw);
  const lines = text.split('\n');
  const positions = findLabelPositions(text);
  const result = {};

  // existing label parsing logic...
  for (const p of positions) {
    const key = labelToKey[p.labelNorm];
    if (!key) continue;
    let val = '';

    if (p.valueOnSameLine && String(p.valueOnSameLine).length > 0) {
      val = p.valueOnSameLine;
    } else if (p.valueOnNextLine && String(p.valueOnNextLine).length > 0) {
      val = p.valueOnNextLine;
    } else {
      const rawLine = p.rawLine || lines[p.lineIndex] || '';
      const colonIdx = rawLine.indexOf(':');
      if (colonIdx >= 0) {
        val = rawLine.slice(colonIdx + 1).trim();
      } else if (/\s{2,}/.test(rawLine)) {
        const parts = rawLine.split(/ {2,}/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) val = parts.slice(1).join(' ');
      }
    }

    val = cleanValue(val || '');
    if (val) result[key] = val;
  }

  // --- FIX: ensure numeric amount extraction ---
  const numericAmountRegex = /₹?\s*([\d,]+(\.\d{1,2})?)/;
  let numericAmount = null;

  for (const line of lines) {
    // Skip "In words" lines
    if (/in words/i.test(line)) continue;

    if (/amount/i.test(line) || /total amount/i.test(line)) {
      const m = line.match(numericAmountRegex);
      if (m) {
        numericAmount = m[1].replace(/,/g, '');
        break;
      }
    }
  }

  if (numericAmount) {
    result.amount = numericAmount;
  }

  // --- existing studentName / fatherName fixups ---
  if (result.studentName) {
    const s = result.studentName;
    const mergedIdx = s.search(/\s(FATHER NAME|FATHER|COURSE|MOBILE NUMBER|NO OF MONTHS|MONTHLY MESS FEE|BRANCH|YEAR OF STUDY)\b/i);
    if (mergedIdx > 0) {
      const left = s.slice(0, mergedIdx).trim();
      const rightToken = s.slice(mergedIdx).trim();
      result.studentName = left;
      const fatherMatch = text.match(/FATHER NAME\s*[:\-]?\s*([^\n]+)/i);
      if (fatherMatch && fatherMatch[1]) {
        result.fatherName = cleanValue(fatherMatch[1]);
      } else if (!result.fatherName) {
        result.fatherName = cleanValue(rightToken.replace(/^FATHER\s*/i, ''));
      }
    }
  }

  if (result.fatherName) {
    result.fatherName = cleanValue(result.fatherName);
  }

  if (result.refNo) result.refNo = String(result.refNo).trim().toUpperCase();
  if (result.rollNo) result.rollNo = String(result.rollNo).trim().toUpperCase();

  Object.keys(result).forEach((k) => {
    if (typeof result[k] === 'string') result[k] = result[k].trim();
  });

  // fallback regex if still missing
  const tryRegex = (variants, key) => {
    if (result[key]) return;
    for (const lbl of variants) {
      const re = new RegExp(lbl.replace(/\s+/g, '\\s+') + '\\s*[:\\-]?\\s*([^\\n]+)', 'i');
      const m = text.match(re);
      if (m && m[1]) {
        result[key] = cleanValue(m[1]);
        return;
      }
    }
  };

  tryRegex(LABELS.refNo, 'refNo');
  tryRegex(LABELS.rollNo, 'rollNo');
  tryRegex(LABELS.studentName, 'studentName');
  tryRegex(LABELS.fatherName, 'fatherName');
  tryRegex(LABELS.amount, 'amount');

  return result;
}


/**
 * Extract plain text from PDF buffer (pdf-parse)
 */
async function pdfBufferToText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data && data.text ? data.text : '';
  } catch (err) {
    console.warn('pdf-parse error', err);
    return '';
  }
}

module.exports = { parseFieldsFromText, pdfBufferToText, normalizeText };
