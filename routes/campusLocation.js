// routes/campusLocation.js
const express = require("express");
const router = express.Router();
const CampusLocation = require('../models/CampusLocation.js');

// POST /api/campus-location
router.post("/", async (req, res) => {
  const { collegeName, latitude, longitude, radius } = req.body;

  try {
    const existing = await CampusLocation.findOne({ collegeName });

    if (existing) {
      existing.latitude = latitude;
      existing.longitude = longitude;
      existing.radius = radius;
      await existing.save();
      return res.json({ message: "Campus location updated", data: existing });
    }

    const newLocation = await CampusLocation.create({
      collegeName,
      latitude,
      longitude,
      radius,
    });

    res.status(201).json({ message: "Campus location saved", data: newLocation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving campus location" });
  }
});

module.exports = router;
