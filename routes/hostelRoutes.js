// routes/hostelRoutes.js
const express = require("express");
const router = express.Router();
const Hostel = require("../models/Hostel");
const { auth, roleCheck } = require("../middleware/auth");

// Only Admin can save hostel data
// routes/hostelRoutes.js
router.post("/create", auth, roleCheck(["admin"]), async (req, res) => {
  const { boys, girls } = req.body;

  // Check if both boys and girls arrays are empty or not provided
  if ((!boys || boys.length === 0) && (!girls || girls.length === 0)) {
    return res.status(400).json({ error: "Invalid hostel data" });
  }

  try {
    const hostelsToCreate = [];

    if (boys && boys.length > 0) {
      hostelsToCreate.push({
        type: "Boys",
        blocks: boys.map((b) => b.trim()), // trimming spaces
      });
    }

    if (girls && girls.length > 0) {
      hostelsToCreate.push({
        type: "Girls",
        blocks: girls.map((g) => g.trim()),
      });
    }

    const savedHostels = await Hostel.insertMany(hostelsToCreate);

    res.status(201).json({
      message: "Hostels created successfully",
      hostels: savedHostels,
    });
  } catch (err) {
    console.error("Hostel save error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all hostels
router.get("/create", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const hostels = await Hostel.find();

    const result = {
      Boys: [],
      Girls: [],
    };

    hostels.forEach((h) => {
      if (h.type === "Boys") result.Boys.push(...h.blocks);
      if (h.type === "Girls") result.Girls.push(...h.blocks);
    });

    res.json(result);
  } catch (err) {
    console.error("Hostel fetch error:", err);
    res.status(500).json({ error: "Failed to fetch hostels" });
  }
}); 

// DELETE /api/hostels/:type/:block
router.delete("/:type/:block", auth, roleCheck(["admin"]), async (req, res) => {
  try {
    const { type, block } = req.params;
    const hostel = await Hostel.findOne({ type });

    if (!hostel) return res.status(404).json({ error: "Hostel type not found" });

    hostel.blocks = hostel.blocks.filter(b => b.trim() !== block.trim());
    await hostel.save();

    res.json({ message: "Block deleted", blocks: hostel.blocks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// PUT /api/hostels/:type/:oldBlock
// Add this to hostelRoutes.js
router.put("/update", auth, roleCheck(["admin"]), async (req, res) => {
  const { boys, girls } = req.body;

  try {
    // Clear previous hostels
    await Hostel.deleteMany({});

    const hostels = [];

    if (boys?.length) {
      hostels.push({ type: "Boys", blocks: boys.map(b => b.trim()) });
    }

    if (girls?.length) {
      hostels.push({ type: "Girls", blocks: girls.map(g => g.trim()) });
    }

    const saved = await Hostel.insertMany(hostels);
    res.json({ message: "Hostels updated", hostels: saved });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});






module.exports = router;
