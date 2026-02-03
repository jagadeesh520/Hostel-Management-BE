// routes/tvAnalytics.js
const express = require("express");
const router = express.Router();
const TVContentAnalytics = require("../models/TVContentAnalytics");
const TVContent = require("../models/TVContent");
const { auth, roleCheck } = require("../middleware/auth");

/**
 * Helper function to get today's date in YYYY-MM-DD format
 */
const getTodayDate = () => {
  const now = new Date();
  return now.toISOString().split("T")[0];
};

/**
 * POST /api/tv-analytics/track
 * Track content display event (public, from TV)
 */
router.post("/track", async (req, res) => {
  try {
    const { contentId, tvDisplayId, hostelId, displayTime } = req.body;

    if (!contentId || !tvDisplayId) {
      return res.status(400).json({ message: "contentId and tvDisplayId are required" });
    }

    const date = getTodayDate();

    // Treat "default" as null (global/no specific hostel)
    const queryHostelId = (hostelId && hostelId !== "default") ? hostelId : null;

    // Find or create analytics record for today
    let analytics = await TVContentAnalytics.findOne({
      contentId,
      tvDisplayId,
      date,
    });

    if (analytics) {
      // Update existing record
      analytics.viewCount += 1;
      analytics.lastDisplayed = new Date();
      analytics.totalDisplayTime += displayTime || 0;
      if (queryHostelId !== analytics.hostelId) {
        analytics.hostelId = queryHostelId;
      }
      await analytics.save();
    } else {
      // Create new record
      analytics = new TVContentAnalytics({
        contentId,
        tvDisplayId,
        hostelId: queryHostelId,
        viewCount: 1,
        lastDisplayed: new Date(),
        totalDisplayTime: displayTime || 0,
        date,
      });
      await analytics.save();
    }

    res.json({
      success: true,
      message: "Tracking recorded",
    });
  } catch (error) {
    console.error("Track analytics error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-analytics/dashboard
 * Get analytics dashboard data (admin only)
 */
router.get("/dashboard", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const { startDate, endDate, hostelId } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = { $gte: startDate, $lte: endDate };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.date = { $gte: thirtyDaysAgo.toISOString().split("T")[0] };
    }

    // Build query
    const query = { ...dateFilter };
    if (hostelId && hostelId !== "default") {
      query.hostelId = hostelId;
    } else if (hostelId === "default") {
      query.hostelId = null;
    }

    // Aggregate total views and display time
    const totalStats = await TVContentAnalytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$viewCount" },
          totalDisplayTime: { $sum: "$totalDisplayTime" },
          uniqueTVs: { $addToSet: "$tvDisplayId" },
        },
      },
    ]);

    // Get most viewed content
    const topContent = await TVContentAnalytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$contentId",
          totalViews: { $sum: "$viewCount" },
          totalDisplayTime: { $sum: "$totalDisplayTime" },
        },
      },
      { $sort: { totalViews: -1 } },
      { $limit: 10 },
    ]);

    // Populate content details
    const topContentWithDetails = await Promise.all(
      topContent.map(async (item) => {
        const content = await TVContent.findById(item._id).select("title contentType thumbnailUrl");
        return {
          ...item,
          content,
        };
      })
    );

    // Get real-time status (TVs that displayed content in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeTVs = await TVContentAnalytics.find({
      lastDisplayed: { $gte: fiveMinutesAgo },
    })
      .distinct("tvDisplayId")
      .lean();

    // Get daily breakdown
    const dailyStats = await TVContentAnalytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$date",
          views: { $sum: "$viewCount" },
          displayTime: { $sum: "$totalDisplayTime" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalViews: totalStats[0]?.totalViews || 0,
          totalDisplayTime: totalStats[0]?.totalDisplayTime || 0,
          uniqueTVs: totalStats[0]?.uniqueTVs?.length || 0,
          activeTVs: activeTVs.length,
        },
        topContent: topContentWithDetails,
        dailyStats,
      },
    });
  } catch (error) {
    console.error("Get analytics dashboard error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-analytics/content/:id
 * Get analytics for specific content (admin only)
 */
router.get("/content/:id", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = { $gte: startDate, $lte: endDate };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.date = { $gte: thirtyDaysAgo.toISOString().split("T")[0] };
    }

    const query = {
      contentId: req.params.id,
      ...dateFilter,
    };

    // Get content details
    const content = await TVContent.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Get analytics
    const analytics = await TVContentAnalytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$viewCount" },
          totalDisplayTime: { $sum: "$totalDisplayTime" },
          uniqueTVs: { $addToSet: "$tvDisplayId" },
        },
      },
    ]);

    // Get daily breakdown
    const dailyStats = await TVContentAnalytics.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$date",
          views: { $sum: "$viewCount" },
          displayTime: { $sum: "$totalDisplayTime" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      content,
      analytics: {
        totalViews: analytics[0]?.totalViews || 0,
        totalDisplayTime: analytics[0]?.totalDisplayTime || 0,
        uniqueTVs: analytics[0]?.uniqueTVs?.length || 0,
      },
      dailyStats,
    });
  } catch (error) {
    console.error("Get content analytics error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-analytics/realtime
 * Get real-time TV status (admin only)
 */
router.get("/realtime", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    // Get TVs that displayed content in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const activeTVs = await TVContentAnalytics.find({
      lastDisplayed: { $gte: fiveMinutesAgo },
    })
      .sort({ lastDisplayed: -1 })
      .populate("contentId", "title contentType thumbnailUrl")
      .lean();

    // Group by TV
    const tvStatus = {};
    activeTVs.forEach((record) => {
      if (!tvStatus[record.tvDisplayId]) {
        tvStatus[record.tvDisplayId] = {
          tvDisplayId: record.tvDisplayId,
          hostelId: record.hostelId,
          lastContent: record.contentId,
          lastDisplayed: record.lastDisplayed,
          isActive: true,
        };
      }
    });

    res.json({
      success: true,
      activeTVs: Object.values(tvStatus),
      count: Object.keys(tvStatus).length,
    });
  } catch (error) {
    console.error("Get realtime analytics error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

