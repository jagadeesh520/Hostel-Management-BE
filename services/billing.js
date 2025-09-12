// services/billing.js
const mongoose = require('mongoose');
const axios = require('axios');
const StudentDue = require('../models/StudentDue');
const MonthlyBill = require('../models/MonthlyBill');
const Student = require('../models/Student'); // optional - adjust path if different

// configure your API base url for timesheet & rates endpoints
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// -------------------- helpers --------------------
const pad2 = (n) => String(n).padStart(2, '0');

function pickYearKey(yearText) {
  const digit = (String(yearText || '').replace(/\D/g, '') || '4');
  if (digit === '1') return 'y1';
  if (digit === '2') return 'y2';
  if (digit === '3') return 'y3';
  return 'y4';
}

function isMaleGender(g) {
  const s = String(g || '').trim().toLowerCase();
  return s === 'male' || s === 'm' || s === 'boy' || s === 'man' || s === 'boys';
}

function normDiet(t) {
  const s = String(t || '').trim().toLowerCase();
  if (/^nv$/.test(s)) return 'non-veg';
  if (/(^|[^a-z])non($|[^a-z])/.test(s)) return 'non-veg';
  if (/non[\s-]?veg/.test(s)) return 'non-veg';
  return 'veg';
}

// fetch present-days for rollNo and month/year (returns integer)
async function fetchPresentDays(rollNo, month, year) {
  try {
    const url = `${API_BASE_URL}/api/timesheetRoutes/${encodeURIComponent(rollNo)}`;
    const res = await axios.get(url, { timeout: 15_000 });
    const tdata = res.data || {};
    // gather presentDates in many possible shapes
    let present = [];
    if (Array.isArray(tdata.presentDates)) present = tdata.presentDates;
    else if (Array.isArray(tdata.present)) present = tdata.present;
    else present = tdata.presentDates || [];

    // normalize to strings like 'YYYY-MM-DD' when possible
    const prefix = `${year}-${pad2(month)}`;
    return (present || []).filter(d => {
      try {
        const s = String(d || '');
        return s.startsWith(prefix);
      } catch (e) { return false; }
    }).length;
  } catch (err) {
    // bubble up a descriptive error
    const msg = (err && err.response && err.response.data) ? JSON.stringify(err.response.data) : err.message || String(err);
    throw new Error(`fetchPresentDays failed for ${rollNo}: ${msg}`);
  }
}

// fetch rates for month/year (returns object or null)
async function fetchRates(month, year) {
  const tryUrls = [
    `${API_BASE_URL}/api/adminRates/rate?month=${month}&year=${year}`,
    `${API_BASE_URL}/api/adminRates/rate?month=${String(month).padStart(2,'0')}&year=${year}`
  ];
  for (const u of tryUrls) {
    try {
      const r = await axios.get(u, { timeout: 10_000 });
      return r.data;
    } catch (e) {
      if (e && e.response && e.response.status === 404) continue;
      // otherwise log and continue next url
      console.warn('fetchRates error', u, e && e.message);
    }
  }
  return null;
}

// compute per-day & est from rates object
function computeFromRates(ratesObj, gender, diet, studentYearText) {
  const base = ratesObj || {};
  const boysVegRate = Number(base.boysVegRate ?? base.boysRate ?? 0);
  const boysNonVegRate = Number(base.boysNonVegRate ?? 0);
  const girlsVegRate = Number(base.girlsVegRate ?? base.girlsRate ?? 0);
  const girlsNonVegRate = Number(base.girlsNonVegRate ?? 0);

  const isMale = isMaleGender(gender);
  const ndiet = normDiet(diet);
  let perDay = 0;
  if (isMale) perDay = ndiet === 'non-veg' ? boysNonVegRate : boysVegRate;
  else perDay = ndiet === 'non-veg' ? girlsNonVegRate : girlsVegRate;

  const yrKey = pickYearKey(studentYearText);
  const estCharge = Number((base.estCharges && base.estCharges[yrKey]) || 0);

  return { perDay, estCharge, raw: base };
}

// -------------------- core: billStudentForMonth --------------------
/**
 * billStudentForMonth
 * @param {String} rollNo
 * @param {Number} month (1..12)
 * @param {Number} year (YYYY)
 * @param {Object} options
 *    - dryRun: boolean (default false) => only compute amounts, do not write
 *    - performedBy: string (user/email) for auditing (optional)
 *    - reason: string note (optional)
 *
 * Returns an object:
 * { billed: true, rollNo, month, year, messBill, estBill, afterTotal, studentName, details } OR
 * { skipped: true, reason: 'already_billed' } OR
 * throws Error on failure
 */
async function billStudentForMonth(rollNo, month, year, options = {}) {
  const { dryRun = false, performedBy = 'system', reason = '' } = options;
  if (!rollNo) throw new Error('rollNo required');
  if (!month || !year) throw new Error('month and year required');

  // normalize
  const normRoll = String(rollNo).trim().toUpperCase();
  month = Number(month); year = Number(year);

  // fetch student due doc (no session yet)
  const sd = await StudentDue.findOne({ rollNo: normRoll }).lean().exec();
  // if studentDue doesn't exist, we still compute amounts (we may create doc on write)
  const existingDue = sd || null;

  // idempotency check: if lastBilledMonth already equals target, skip
  if (existingDue && existingDue.lastBilledMonth && existingDue.lastBilledMonth.month === month && existingDue.lastBilledMonth.year === year) {
    return { skipped: true, reason: 'already_billed', rollNo: normRoll, month, year };
  }

  // load student profile to get gender/year/diet if required
  let profile = null;
  try {
    profile = await Student.findOne({ rollNo: normRoll }).lean().exec();
  } catch (e) {
    // non-fatal - continue with defaults if Student model not present or fails
    profile = null;
  }

  const gender = (profile && (profile.gender || profile.sex)) || undefined;
  const diet = (profile && (profile.type || profile.diet)) || undefined;
  const studentYearText = (profile && (profile.year || profile.class || profile.academicYear)) || undefined;
  const studentName = (existingDue && existingDue.studentName) || (profile && (profile.name || profile.fullName || profile.studentName)) || '';

  // compute present days
  const presentDays = await fetchPresentDays(normRoll, month, year);

  // fetch rates for the month/year
  const ratesObj = await fetchRates(month, year);
  const { perDay, estCharge } = computeFromRates(ratesObj, gender, diet, studentYearText);

  const messBill = Math.max(0, Number(perDay || 0) * Number(presentDays || 0));
  const estBill = Math.max(0, Number(estCharge || 0));

  const details = {
    rollNo: normRoll,
    studentName,
    presentDays,
    perDay,
    estCharge,
    computed: { messBill, estBill },
    source: { ratesObjAvailable: !!ratesObj, profileFetched: !!profile }
  };

  if (dryRun) {
    return { dryRun: true, rollNo: normRoll, month, year, messBill, estBill, details };
  }

  // Now perform DB transaction: create MonthlyBill, update StudentDue, push paymentLog
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // create MonthlyBill (unique index prevents duplicates)
    const monthlyDoc = await MonthlyBill.create([{
      rollNo: normRoll,
      studentName: studentName || '',
      month, year,
      messBill, estBill,
      presentDays,
      perDayRate: perDay,
      status: 'billed',
      note: reason || `Auto monthly billing ${year}-${String(month).padStart(2,'0')} by ${performedBy}`
    }], { session });

    // upsert StudentDue doc if not present
    let studentDueDoc = await StudentDue.findOne({ rollNo: normRoll }).session(session).exec();
    if (!studentDueDoc) {
      studentDueDoc = new StudentDue({
        rollNo: normRoll,
        studentName: studentName || '',
        messDue: 0,
        estDue: 0,
        totalDue: 0,
        credit: 0,
        paymentLogs: []
      });
    }

    // compute before/after
    const beforeMess = Number(studentDueDoc.messDue || 0);
    const beforeEst = Number(studentDueDoc.estDue || 0);
    const afterMess = beforeMess + messBill;
    const afterEst = beforeEst + estBill;
    const afterTotal = Number(afterMess + afterEst);

    // push paymentLog entry with billing fields
    const logEntry = {
      createdAt: new Date(),
      status: 'billed',
      beforeEstDue: beforeEst,
      beforeMessDue: beforeMess,
      amount: 0,
      amtPaidEst: 0,
      amtPaidMess: 0,
      amtBilledEst: estBill,
      amtBilledMess: messBill,
      afterTotalDue: afterTotal,
      studentName: studentName || studentDueDoc.studentName || '',
      note: reason || `Auto-billed for ${year}-${String(month).padStart(2,'0')}`,
      month,
      year
    };

    // update student due fields
    studentDueDoc.messDue = afterMess;
    studentDueDoc.estDue = afterEst;
    studentDueDoc.totalDue = afterTotal;
    studentDueDoc.lastBilledMonth = { month, year };
    studentDueDoc.lastUploadAt = new Date();
    if (performedBy) studentDueDoc.lastUploadBy = performedBy;

    // push monthly bill ref (store ObjectId returned by create)
    if (monthlyDoc && monthlyDoc[0] && monthlyDoc[0]._id) {
      studentDueDoc.monthlyBills = studentDueDoc.monthlyBills || [];
      studentDueDoc.monthlyBills.push(monthlyDoc[0]._id);
    }

    studentDueDoc.paymentLogs = studentDueDoc.paymentLogs || [];
    studentDueDoc.paymentLogs.push(logEntry);

    // save
    await studentDueDoc.save({ session });

    // commit
    await session.commitTransaction();
    session.endSession();

    return {
      billed: true,
      rollNo: normRoll,
      month,
      year,
      messBill,
      estBill,
      afterTotal,
      studentName,
      details
    };
  } catch (err) {
    // If MonthlyBill unique index caused duplicate (race), interpret as already billed
    if (err && err.code === 11000) {
      // try to commit/cleanup and return skipped
      try { await session.abortTransaction(); } catch(_) {}
      session.endSession();
      return { skipped: true, reason: 'already_billed_race', rollNo: normRoll, month, year };
    }

    await session.abortTransaction();
    session.endSession();
    const msg = err && (err.message || JSON.stringify(err)) || String(err);
    throw new Error(`Failed to bill ${normRoll} for ${year}-${String(month).padStart(2,'0')}: ${msg}`);
  }
}

// export
module.exports = { billStudentForMonth };
