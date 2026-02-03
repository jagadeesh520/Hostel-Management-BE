// routes/tvDisplayConfig.js
const express = require("express");
const router = express.Router();
const TVDisplayConfig = require("../models/TVDisplayConfig");
const { auth, roleCheck } = require("../middleware/auth");

/**
 * GET /api/tv-display-config/:hostelId
 * Get TV display configuration (public)
 */
router.get("/:hostelId", async (req, res) => {
  try {
    let { hostelId } = req.params;
    
    // Treat "default" as null (global config)
    const queryHostelId = hostelId === "default" ? null : hostelId;

    let config = await TVDisplayConfig.findOne({ hostelId: queryHostelId });

    // If no config exists, return default
    if (!config) {
      return res.json({
        success: true,
        config: {
          hostelId,
          displayName: "Default Display",
          rotationSettings: {
            timetableEnabled: true,
            timetableDuration: 15,
            menuEnabled: true,
            menuDuration: 20,
            foodImagesEnabled: true,
            foodImagesDuration: 10,
            videosEnabled: true,
            videoDuration: 60,
          },
          theme: {
            backgroundColor: "#1a1a2e",
            primaryColor: "#6200ee",
            fontFamily: "Arial, sans-serif",
          },
          isActive: true,
        },
      });
    }

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("Get TV display config error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * PUT /api/tv-display-config/:hostelId
 * Update TV display configuration (admin only)
 */
router.put("/:hostelId", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    let { hostelId } = req.params;
    
    // Treat "default" as null (global config)
    const queryHostelId = hostelId === "default" ? null : hostelId;
    
    const { displayName, rotationSettings, theme, isActive } = req.body;

    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (rotationSettings) updateData.rotationSettings = rotationSettings;
    if (theme) updateData.theme = theme;
    if (isActive !== undefined) updateData.isActive = isActive;

    let config = await TVDisplayConfig.findOne({ hostelId: queryHostelId });

    if (config) {
      // Update existing config
      Object.assign(config, updateData);
      await config.save();
    } else {
      // Create new config
      config = new TVDisplayConfig({
        hostelId: queryHostelId,
        ...updateData,
      });
      await config.save();
    }

    res.json({
      success: true,
      message: "Configuration updated",
      config,
    });
  } catch (error) {
    console.error("Update TV display config error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-display-config
 * List all TV display configurations (admin only)
 */
router.get("/", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const configs = await TVDisplayConfig.find().populate("hostelId", "name location").lean();

    res.json({
      success: true,
      configs,
      count: configs.length,
    });
  } catch (error) {
    console.error("List TV display configs error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * DELETE /api/tv-display-config/:hostelId
 * Delete TV display configuration (admin only)
 */
router.delete("/:hostelId", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    let { hostelId } = req.params;
    
    // Treat "default" as null (global config)
    const queryHostelId = hostelId === "default" ? null : hostelId;

    const config = await TVDisplayConfig.findOneAndDelete({ hostelId: queryHostelId });

    if (!config) {
      return res.status(404).json({ message: "Configuration not found" });
    }

    res.json({
      success: true,
      message: "Configuration deleted",
    });
  } catch (error) {
    console.error("Delete TV display config error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

