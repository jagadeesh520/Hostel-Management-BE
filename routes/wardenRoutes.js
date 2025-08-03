// routes/wardenRoutes.js
const express = require("express");
const router = express.Router();
const Warden = require("../models/Warden");
const { auth, roleCheck } = require("../middleware/auth");

// CREATE or UPDATE WARDEN
router.post("/", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { name, phone, block, hostelType } = req.body;

    if (!name || !phone || !block || !hostelType) {
      return res.status(400).json({ error: "All fields are required" });
    }

    let warden = await Warden.findOne({ block, hostelType });

    if (warden) {
      // Update
      warden.name = name;
      warden.phone = phone;
      await warden.save();
      return res.json({ message: "Warden updated", warden });
    } else {
      // Create
      const newWarden = new Warden({ name, phone, block, hostelType });
      await newWarden.save();
      return res.status(201).json({ message: "Warden created", warden: newWarden });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET ALL WARDENS
// GET all wardens
// GET all wardens (admin only), or current warden’s data (if role is 'warden')
router.get("/", auth, roleCheck(["admin", "Warden"]), async (req, res) => {
  try {
    const wardens = await Warden.find(); // Return all wardens
    return res.json(wardens);
  } catch (err) {
    console.error("Error fetching wardens:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});


// PUT /api/wardens/:id
router.put("/:id", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    const warden = await Warden.findById(id);
    if (!warden) {
      return res.status(404).json({ error: "Warden not found" });
    }

    warden.name = name || warden.name;
    warden.phone = phone || warden.phone;
    await warden.save();

    res.json({ message: "Warden updated", warden });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});


// DELETE WARDEN
router.delete("/:id", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    await Warden.findByIdAndDelete(id);
    res.json({ message: "Warden deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
