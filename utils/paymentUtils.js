// utils/paymentUtils.js
const mongoose = require('mongoose');
const Challan = require('../models/Challan');
const StudentDue = require('../models/StudentDue');

/* ---------- helpers ---------- */

function parseNumberValue(v) {
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[,₹$]/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function findAmountInChallan(challan) {
  if (!challan || typeof challan !== 'object') return NaN;
  const candidates = [
    challan.amount,
    challan.fields && challan.fields.amount,
    challan.data && challan.data.amount
  ];
  for (const c of candidates) {
    const n = parseNumberValue(c);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  // fallback: try to find any numeric token in string fields
  for (const k of Object.keys(challan || {})) {
    const v = challan[k];
    if (typeof v === 'string') {
      const m = v.match(/([0-9\.,]+)/);
      if (m) {
        const n = parseNumberValue(m[1]);
        if (!Number.isNaN(n) && n > 0) return n;
      }
    } else if (typeof v === 'number') {
      return v;
    } else if (typeof v === 'object' && v !== null) {
      for (const k2 of Object.keys(v)) {
        const vv = v[k2];
        if (typeof vv === 'string') {
          const m = vv.match(/([0-9\.,]+)/);
          if (m) {
            const n = parseNumberValue(m[1]);
            if (!Number.isNaN(n) && n > 0) return n;
          }
        } else if (typeof vv === 'number') {
          return vv;
        }
      }
    }
  }
  return NaN;
}

function findCategoryInChallan(challan) {
  if (!challan || typeof challan !== 'object') return '';
  const cands = [
    challan.category,
    challan.fields && challan.fields.category,
    challan.data && challan.data.category
  ];
  for (const c of cands) {
    if (c && typeof c === 'string') return c.toUpperCase();
  }
  // fallback: examine refNo or other clue strings
  return '';
}

/* ---------- main function ---------- */

/**
 * applyApprovedChallan(challanId)
 * - applies amount from an approved challan to StudentDue.estDue / messDue
 * - updates or pushes a paymentLogs entry inside StudentDue
 *
 * Returns an object: { applied: boolean, reason?: string, appliedToEst?, appliedToMess?, studentDue? }
 */
async function applyApprovedChallan(challanId) {
  const normRoll = r => (r || '').toString().trim().toUpperCase();

  // if mongoose supports transactions, use them
  const canTxn = !!(mongoose.connection && mongoose.connection.startSession);

  if (canTxn) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const challan = await Challan.findById(challanId).session(session);
      if (!challan) {
        await session.abortTransaction(); session.endSession();
        return { applied: false, reason: 'challan_not_found' };
      }
      if ((challan.status || '').toLowerCase() !== 'approved') {
        await session.abortTransaction(); session.endSession();
        return { applied: false, reason: 'not_approved' };
      }
      if (challan.appliedToDues) {
        await session.commitTransaction(); session.endSession();
        return { applied: false, reason: 'already_applied' };
      }

      const amount = findAmountInChallan(challan);
      if (!amount || isNaN(amount) || amount <= 0) {
        await session.abortTransaction(); session.endSession();
        return { applied: false, reason: 'invalid_amount', parsedAmount: amount };
      }

      const rollNoNormalized = normRoll(challan.rollNo || (challan.fields && challan.fields.rollNo));
      if (!rollNoNormalized) {
        await session.abortTransaction(); session.endSession();
        return { applied: false, reason: 'missing_rollno' };
      }

      // fetch or create studentDue
      let studentDue = await StudentDue.findOne({ rollNo: rollNoNormalized }).session(session);
      if (!studentDue) {
        studentDue = new StudentDue({
          rollNo: rollNoNormalized,
          studentName: challan.studentName || (challan.fields && challan.fields.studentName) || ''
        });
      }

      // capture before snapshots
      const beforeEst = Number(studentDue.estDue || 0);
      const beforeMess = Number(studentDue.messDue || 0);

      let rem = Number(amount || 0);
      let appliedToEst = 0;
      let appliedToMess = 0;

      const category = findCategoryInChallan(challan);

      if (category.includes('MESS')) {
        // mess-first
        const mRed = Math.min(beforeMess, rem);
        studentDue.messDue = Math.max(0, beforeMess - mRed);
        appliedToMess += mRed;
        rem -= mRed;

        if (rem > 0) {
          const eRed = Math.min(beforeEst, rem);
          studentDue.estDue = Math.max(0, beforeEst - eRed);
          appliedToEst += eRed;
          rem -= eRed;
        }
      } else {
        // est-first for FEES/EST or default
        const eRed = Math.min(beforeEst, rem);
        studentDue.estDue = Math.max(0, beforeEst - eRed);
        appliedToEst += eRed;
        rem -= eRed;

        if (rem > 0) {
          const mRed = Math.min(beforeMess, rem);
          studentDue.messDue = Math.max(0, beforeMess - mRed);
          appliedToMess += mRed;
          rem -= mRed;
        }
        // leftover is credit
        if (rem > 0) {
          studentDue.credit = Number(studentDue.credit || 0) + rem;
          rem = 0;
        }
      }

      // recompute totalDue
      studentDue.totalDue = Number(studentDue.messDue || 0) + Number(studentDue.estDue || 0);

      // save studentDue
      await studentDue.save({ session });

      // mark challan applied
      challan.appliedToDues = true;
      challan.appliedAt = new Date();
      await challan.save({ session });

      // update existing paymentLogs entry by challanId or refNo
      const logSet = {
        $set: {
          "paymentLogs.$.status": "applied",
          "paymentLogs.$.appliedAt": new Date(),
          "paymentLogs.$.amtPaidEst": appliedToEst,
          "paymentLogs.$.amtPaidMess": appliedToMess,
          "paymentLogs.$.amount": amount,
          "paymentLogs.$.afterTotalDue": Number(studentDue.totalDue || 0)
        }
      };

      const updateByChallan = await StudentDue.updateOne(
        { rollNo: rollNoNormalized, "paymentLogs.challanId": challan._id },
        logSet,
        { session }
      );

      if (updateByChallan.matchedCount === 0) {
        // try by refNo
        const refNo = challan.refNo || (challan.fields && challan.fields.refNo) || '';
        if (refNo) {
          const updateByRef = await StudentDue.updateOne(
            { rollNo: rollNoNormalized, "paymentLogs.refNo": refNo },
            logSet,
            { session }
          );
          if (updateByRef.matchedCount === 0) {
            // push new log entry as fallback
            await StudentDue.updateOne(
              { rollNo: rollNoNormalized },
              {
                $push: {
                  paymentLogs: {
                    challanId: challan._id,
                    refNo: refNo,
                    createdAt: new Date(),
                    appliedAt: new Date(),
                    status: 'applied',
                    beforeEstDue: beforeEst,
                    beforeMessDue: beforeMess,
                    amount: amount,
                    amtPaidEst: appliedToEst,
                    amtPaidMess: appliedToMess,
                    afterTotalDue: Number(studentDue.totalDue || 0),
                    studentName: studentDue.studentName || ''
                  }
                }
              },
              { session }
            );
          }
        } else {
          // no refNo — push new
          await StudentDue.updateOne(
            { rollNo: rollNoNormalized },
            {
              $push: {
                paymentLogs: {
                  challanId: challan._id,
                  refNo: '',
                  createdAt: new Date(),
                  appliedAt: new Date(),
                  status: 'applied',
                  beforeEstDue: beforeEst,
                  beforeMessDue: beforeMess,
                  amount: amount,
                  amtPaidEst: appliedToEst,
                  amtPaidMess: appliedToMess,
                  afterTotalDue: Number(studentDue.totalDue || 0),
                  studentName: studentDue.studentName || ''
                }
              }
            },
            { session }
          );
        }
      }

      await session.commitTransaction();
      session.endSession();

      return {
        applied: true,
        appliedToEst,
        appliedToMess,
        remainingCredit: Number(studentDue.credit || 0),
        studentDue: studentDue.toObject()
      };
    } catch (err) {
      try { await session.abortTransaction(); } catch (_) {}
      session.endSession();
      throw err;
    }
  } // end txn path

  // ---------- Fallback non-transactional path ----------
  // find and claim the challan
  const claimed = await Challan.findOneAndUpdate(
    { _id: challanId, status: 'approved', appliedToDues: { $ne: true } },
    { $set: { appliedToDues: true, appliedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return { applied: false, reason: 'not_claimed_or_not_approved_or_already_applied' };

  const amount = findAmountInChallan(claimed);
  if (!amount || isNaN(amount) || amount <= 0) return { applied: false, reason: 'invalid_amount' };

  const rollNoNormalized = normRoll(claimed.rollNo || (claimed.fields && claimed.fields.rollNo));
  if (!rollNoNormalized) return { applied: false, reason: 'missing_rollno' };

  let studentDue = await StudentDue.findOne({ rollNo: rollNoNormalized });
  if (!studentDue) {
    studentDue = new StudentDue({
      rollNo: rollNoNormalized,
      studentName: claimed.studentName || (claimed.fields && claimed.fields.studentName) || ''
    });
  }

  const beforeEst = Number(studentDue.estDue || 0);
  const beforeMess = Number(studentDue.messDue || 0);

  let rem = Number(amount || 0);
  let appliedToEst = 0;
  let appliedToMess = 0;

  const category = findCategoryInChallan(claimed);
  if (category.includes('MESS')) {
    const mRed = Math.min(beforeMess, rem);
    studentDue.messDue = Math.max(0, beforeMess - mRed);
    appliedToMess += mRed;
    rem -= mRed;
    if (rem > 0) {
      const eRed = Math.min(beforeEst, rem);
      studentDue.estDue = Math.max(0, beforeEst - eRed);
      appliedToEst += eRed;
      rem -= eRed;
    }
  } else {
    const eRed = Math.min(beforeEst, rem);
    studentDue.estDue = Math.max(0, beforeEst - eRed);
    appliedToEst += eRed;
    rem -= eRed;
    if (rem > 0) {
      const mRed = Math.min(beforeMess, rem);
      studentDue.messDue = Math.max(0, beforeMess - mRed);
      appliedToMess += mRed;
      rem -= mRed;
    }
    if (rem > 0) {
      studentDue.credit = Number(studentDue.credit || 0) + rem;
      rem = 0;
    }
  }

  studentDue.totalDue = Number(studentDue.messDue || 0) + Number(studentDue.estDue || 0);
  await studentDue.save();

  // update existing log or push new
  const logSet = {
    $set: {
      "paymentLogs.$.status": "applied",
      "paymentLogs.$.appliedAt": new Date(),
      "paymentLogs.$.amtPaidEst": appliedToEst,
      "paymentLogs.$.amtPaidMess": appliedToMess,
      "paymentLogs.$.amount": amount,
      "paymentLogs.$.afterTotalDue": Number(studentDue.totalDue || 0)
    }
  };

  let updated = await StudentDue.updateOne({ rollNo: rollNoNormalized, "paymentLogs.challanId": claimed._id }, logSet);
  if (!updated.matchedCount || updated.matchedCount === 0) {
    const refNo = claimed.refNo || (claimed.fields && claimed.fields.refNo) || '';
    if (refNo) {
      updated = await StudentDue.updateOne({ rollNo: rollNoNormalized, "paymentLogs.refNo": refNo }, logSet);
    }
  }
  if (!updated.matchedCount || updated.matchedCount === 0) {
    await StudentDue.updateOne({ rollNo: rollNoNormalized }, {
      $push: {
        paymentLogs: {
          challanId: claimed._id,
          refNo: claimed.refNo || '',
          createdAt: new Date(),
          appliedAt: new Date(),
          status: 'applied',
          beforeEstDue: beforeEst,
          beforeMessDue: beforeMess,
          amount: amount,
          amtPaidEst: appliedToEst,
          amtPaidMess: appliedToMess,
          afterTotalDue: Number(studentDue.totalDue || 0),
          studentName: studentDue.studentName || ''
        }
      }
    });
  }

  return { applied: true, appliedToEst, appliedToMess, remainingCredit: Number(studentDue.credit || 0), studentDue: studentDue.toObject() };
}

module.exports = { applyApprovedChallan, findAmountInChallan };
