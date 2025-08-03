// routes/upiRoutes.js
const express = require("express");
const router = express.Router();
const UPI = require("../models/upiModel");

// GET current active UPI ID
router.get("/", async (req, res) => {
  try {
    const upi = await UPI.findOne({ isActive: true });
    if (!upi) return res.status(404).json({ message: "No active UPI ID set" });
    res.json(upi);
  } catch (err) {
    console.error("UPI fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST/PUT to add or update UPI ID
router.post("/", async (req, res) => {
  const { upiId, label } = req.body;

  if (!upiId) {
    return res.status(400).json({ message: "UPI ID is required" });
  }

  try {
    // Deactivate old UPI entries
    await UPI.updateMany({ isActive: true }, { $set: { isActive: false } });

    const newUPI = new UPI({
      upiId,
      label: label || "College Mess",
    });

    await newUPI.save();
    res.status(201).json({ message: "UPI ID saved successfully", upi: newUPI });
  } catch (err) {
    console.error("UPI save error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
