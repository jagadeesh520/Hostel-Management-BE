const express = require("express");
const router = express.Router();
const DailyRate = require("../models/DailyRate");
const { auth, roleCheck } = require("../middleware/auth");

/** Helper: normalize month input.
 * Accepts "7", "07", 7, also supports old 0-based values (6 for July).
 * Returns { m1: number (1..12), candidates: [1..12, 0..11] for tolerant reads }.
 */
function normalizeMonthForRead(rawMonth) {
  const m = Number(rawMonth);
  if (!Number.isFinite(m)) return { m1: NaN, candidates: [] };

  // Suppose client intends 1..12:
  const m1 = m >= 1 && m <= 12 ? m : m + 1; // if m was 0..11, shift to 1..12
  const candidates = [m1, m]; // try 1-based first, then the raw (could be 0-based)
  return { m1, candidates };
}

function normalizeMonthForWrite(rawMonth) {
  const m = Number(rawMonth);
  if (!Number.isFinite(m)) return NaN;
  // Persist in 1..12 range
  if (m >= 1 && m <= 12) return m;
  if (m >= 0 && m <= 11) return m + 1; // convert old 0-based to 1-based
  return NaN;
}

// -------- Create (only if not exists) --------
router.post("/set-daily-rate", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const {
      month,
      year,
      boysRate, girlsRate, boysTotal, girlsTotal,              // old (optional)
      boysVegRate, boysNonVegRate, girlsVegRate, girlsNonVegRate, // new
      estCharges, // { y1, y2, y3, y4 }
    } = req.body;

    const m = normalizeMonthForWrite(month);
    const y = Number(year);

    if (!Number.isFinite(m) || !Number.isFinite(y)) {
      return res.status(400).json({ message: "Invalid month/year" });
    }

    const exists = await DailyRate.findOne({ month: m, year: y });
    if (exists) {
      return res.status(409).json({
        message: "Rate for this month already exists. Please edit if needed.",
        existing: exists,
      });
    }

    const doc = new DailyRate({
      month: m,
      year: y,

      // old fields kept for backward compat
      boysRate: Number(boysRate) || 0,
      girlsRate: Number(girlsRate) || 0,
      boysTotal: Number(boysTotal) || 0,
      girlsTotal: Number(girlsTotal) || 0,

      // new fields
      boysVegRate: Number(boysVegRate) || 0,
      boysNonVegRate: Number(boysNonVegRate) || 0,
      girlsVegRate: Number(girlsVegRate) || 0,
      girlsNonVegRate: Number(girlsNonVegRate) || 0,

      estCharges: {
        y1: Number(estCharges?.y1) || 0,
        y2: Number(estCharges?.y2) || 0,
        y3: Number(estCharges?.y3) || 0,
        y4: Number(estCharges?.y4) || 0,
      },
    });

    await doc.save();
    return res.status(201).json({ message: "Daily rates set successfully", rate: doc });
  } catch (err) {
    console.error("Error setting daily rate:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// -------- Read by month & year (tolerant of 0- or 1-based) --------
router.get("/rate", async (req, res) => {
  try {
    const { month, year } = req.query;
    const y = Number(year);
    const { m1, candidates } = normalizeMonthForRead(month);

    if (!Number.isFinite(y) || !Number.isFinite(m1)) {
      return res.status(400).json({ message: "Invalid month/year" });
    }

    // Try 1-based first, then raw month (covers old 0-based docs)
    let rate = null;
    for (const cand of candidates) {
      rate = await DailyRate.findOne({ month: cand, year: y });
      if (rate) break;
    }

    if (!rate) {
      return res.status(404).json({ message: "Rate not found" });
    }

    return res.json(rate);
  } catch (err) {
    console.error("GET /rate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------- Update by ID (partial updates allowed) --------
router.put("/update-daily-rate/:id", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const fields = {};
    const keys = [
      "boysRate", "girlsRate", "boysTotal", "girlsTotal",
      "boysVegRate", "boysNonVegRate", "girlsVegRate", "girlsNonVegRate",
    ];

    for (const k of keys) {
      if (k in req.body) fields[k] = Number(req.body[k]) || 0;
    }

    // estCharges as nested object
    if (req.body.estCharges) {
      fields["estCharges"] = {
        y1: Number(req.body.estCharges.y1) || 0,
        y2: Number(req.body.estCharges.y2) || 0,
        y3: Number(req.body.estCharges.y3) || 0,
        y4: Number(req.body.estCharges.y4) || 0,
      };
    }

    const updated = await DailyRate.findByIdAndUpdate(
      req.params.id,
      fields,
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Rate not found" });
    return res.json({ message: "Rate updated successfully", updated });
  } catch (err) {
    console.error("PUT /update-daily-rate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------- Delete by ID --------
router.delete("/delete-daily-rate/:id", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const deleted = await DailyRate.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Rate not found" });
    return res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE /delete-daily-rate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
