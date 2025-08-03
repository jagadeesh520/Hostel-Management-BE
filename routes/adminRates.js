// routes/adminRates.js
const express = require("express");
const router = express.Router();
const DailyRate = require("../models/DailyRate");
const { auth, roleCheck } = require("../middleware/auth");

// Set new daily rate (only if not already set for that month-year)
router.post("/set-daily-rate", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { month, year, boysRate, girlsRate } = req.body;

    // Validate input
    if (
      typeof month !== "number" ||
      typeof year !== "number" ||
      typeof boysRate !== "number" ||
      typeof girlsRate !== "number"
    ) {
      return res.status(400).json({ message: "Invalid or missing required fields" });
    }

    // Check if rate for this month-year already exists
    const exists = await DailyRate.findOne({ month, year });
    if (exists) {
      return res.status(409).json({
        message: "Rate for this month already exists. Please edit if needed.",
        existing: exists,
      });
    }

    // Create new rate
    const newRate = new DailyRate({ month, year, boysRate, girlsRate });
    await newRate.save();

    return res.status(201).json({
      message: "Daily rates set successfully",
      rate: newRate,
    });

  } catch (err) {
    console.error("Error setting daily rate:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


// Get rate by month and year
router.get("/rate", async (req, res) => {
  const { month, year } = req.query;

  try {
    const rate = await DailyRate.findOne({ month: Number(month), year: Number(year) });
    if (!rate) {
      return res.status(404).json({ message: "Rate not found" });
    }
    res.json(rate);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update existing rate (admin controlled, requires rate ID)
router.put("/update-daily-rate/:id", auth, roleCheck(["admin"]), async (req, res) => {
  const { boysRate, girlsRate, boysTotal, girlsTotal } = req.body;

  try {
    const updated = await DailyRate.findByIdAndUpdate(
      req.params.id,
      { boysRate, girlsRate, boysTotal, girlsTotal },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Rate not found" });
    }

    res.json({ message: "Rate updated successfully", updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete rate by ID
router.delete("/delete-daily-rate/:id", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const deleted = await DailyRate.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Rate not found" });
    }
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
