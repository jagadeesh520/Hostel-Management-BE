// routes/tvContent.js
const express = require("express");
const router = express.Router();
const TVContent = require("../models/TVContent");
const { auth, roleCheck } = require("../middleware/auth");
const { uploadSingle, uploadOptional, uploadMultiple, cleanupTempFile, TEMP_DIR } = require("../middleware/cloudUpload");
const path = require("path");
const fs = require("fs");
const DEBUG_LOG_PATH = path.join(__dirname, "../../.cursor/debug.log");
const logDebug = (location, message, data, hypothesisId) => {
  try {
    const logEntry = JSON.stringify({location, message, data, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId}) + '\n';
    fs.appendFileSync(DEBUG_LOG_PATH, logEntry, 'utf8');
  } catch (e) {}
};

/**
 * POST /api/tv-content/test-upload
 * Test endpoint to verify request reaches server (no auth, no file processing)
 */
router.post("/test-upload", (req, res) => {
  console.log("✅ Test upload endpoint reached (no auth)");
  console.log("Headers:", req.headers);
  console.log("Content-Type:", req.headers['content-type']);
  res.json({ message: "Test endpoint reached successfully", headers: req.headers });
});

/**
 * POST /api/tv-content/upload-local
 * Temporary upload endpoint WITHOUT authentication for local testing
 * WARNING: Remove this in production!
 */
router.post("/upload-local", uploadMultiple("files", 50), async (req, res) => {
  try {
    console.log("🔵 LOCAL UPLOAD (NO AUTH) - Upload route hit");
    console.log("Headers:", req.headers);
    console.log("Content-Type:", req.headers['content-type']);
    console.log("🟢 After multer middleware");
    
    const files = req.files || (req.file ? [req.file] : []);
    const { 
      contentType, title, mealType, displayDuration, hostelId, 
      scheduledStart, scheduledEnd, metadata,
      notificationType, priority, description 
    } = req.body;
    
    console.log("📥 Upload request received:", {
      contentType,
      title,
      fileCount: files.length,
      bodyKeys: Object.keys(req.body || {}),
    });

    // For videos, displayDuration of 0 means "play full video"
    // For other content types, ensure displayDuration meets minimum requirement (3 seconds)
    let parsedDisplayDuration;
    if (contentType === "video" && parseInt(displayDuration) === 0) {
      parsedDisplayDuration = 0; // Special value: play full video
    } else {
      parsedDisplayDuration = displayDuration ? Math.max(3, parseInt(displayDuration) || 10) : 10;
    }

    // Validate required fields
    if (!contentType || !title) {
      console.error("❌ Validation failed:", { contentType, title, body: req.body });
      // Cleanup any uploaded files
      files.forEach(file => {
        if (file && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (err) { console.error("Error cleaning up temp file:", err); }
        }
      });
      return res.status(400).json({ message: "contentType and title are required" });
    }
    
    console.log("✅ Validation passed:", { contentType, title, fileCount: files.length });

    // File is optional for notifications (text-only notifications)
    if (files.length === 0 && contentType !== "notification") {
      return res.status(400).json({ message: "At least one file is required" });
    }

    // Process multiple files - create separate content entry for each
    const uploadedContents = [];
    const errors = [];

    // Get the highest display order for this content type
    const maxOrderDoc = await TVContent.findOne({ contentType }).sort({ displayOrder: -1 }).limit(1);
    let currentDisplayOrder = maxOrderDoc ? maxOrderDoc.displayOrder + 1 : 0;

    // Parse metadata once
    let parsedMetadata = {};
    if (metadata) {
      try { parsedMetadata = JSON.parse(metadata); } catch (parseError) { parsedMetadata = {}; }
    }

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let mediaUrl = null;

      try {
        // Create content-type specific directory
        const uploadDir = path.join(__dirname, "../uploads/tv-content", contentType);
        if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const ext = path.extname(file.originalname);
        const filename = `${contentType}_${timestamp}_${i}_${randomStr}${ext}`;
        const finalPath = path.join(uploadDir, filename);

        // Move file from temp to final location
        fs.renameSync(file.path, finalPath);

        // Generate public URL
        mediaUrl = `/uploads/tv-content/${contentType}/${filename}`;
        console.log(`✅ File ${i + 1}/${files.length} saved locally: ${mediaUrl}`);

        // Create content entry for this file
        const contentTitle = files.length > 1 ? `${title} (${i + 1})` : title;
        const finalDuration = contentType === "video" && parsedDisplayDuration === 0 ? 0 : parsedDisplayDuration;
        
        const tvContent = new TVContent({
          contentType,
          title: contentTitle,
          mediaUrl,
          thumbnailUrl: null,
          mealType: mealType || null,
          displayOrder: currentDisplayOrder++,
          displayDuration: finalDuration,
          hostelId: hostelId || null,
          scheduledStart: scheduledStart || null,
          scheduledEnd: scheduledEnd || null,
          metadata: parsedMetadata,
          uploadedBy: null, // No user for local testing
          notificationType: notificationType || null,
          priority: priority || "medium",
          description: description || null,
        });

        await tvContent.save();
        uploadedContents.push(tvContent);
      } catch (error) {
        console.error(`Error processing file ${i + 1}:`, error);
        errors.push({ fileIndex: i, fileName: file.originalname, error: error.message });
        if (fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (cleanupErr) { console.error("Error cleaning up failed file:", cleanupErr); }
        }
      }
    }

    // Return response
    if (uploadedContents.length === 0) {
      return res.status(500).json({ message: "Failed to upload any files", errors });
    }

    if (errors.length > 0) {
      return res.status(207).json({ 
        message: `Partially successful: ${uploadedContents.length} uploaded, ${errors.length} failed`, 
        content: uploadedContents.length === 1 ? uploadedContents[0] : uploadedContents,
        count: uploadedContents.length,
        errors 
      });
    }

    res.status(201).json({ 
      message: `Successfully uploaded ${uploadedContents.length} file(s)`, 
      content: uploadedContents.length === 1 ? uploadedContents[0] : uploadedContents,
      count: uploadedContents.length 
    });
  } catch (error) {
    console.error("Upload TV content error:", error);
    const files = req.files || (req.file ? [req.file] : []);
    files.forEach(file => {
      if (file && fs.existsSync(file.path)) { cleanupTempFile(file.path); }
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * POST /api/tv-content/upload
 * Upload new TV content (admin only)
 * File is optional for notifications (text-only notifications supported)
 */
router.post("/upload", auth, roleCheck(["Admin"]), (req, res, next) => {
  console.log("🔵 Upload route hit - before multer");
  console.log("Headers:", req.headers);
  console.log("Content-Type:", req.headers['content-type']);
  next();
}, uploadMultiple("files", 50), async (req, res) => {
  try {
    console.log("🟢 After multer middleware");
    const files = req.files || (req.file ? [req.file] : []);
    console.log("📥 Upload request received:", {
      contentType: req.body?.contentType,
      title: req.body?.title,
      fileCount: files.length,
      bodyKeys: Object.keys(req.body || {}),
      filesArray: files,
    });

    const { 
      contentType, title, mealType, displayDuration, hostelId, 
      scheduledStart, scheduledEnd, metadata,
      notificationType, priority, description 
    } = req.body;
    
    // For videos, displayDuration of 0 means "play full video"
    // For other content types, ensure displayDuration meets minimum requirement (3 seconds)
    let parsedDisplayDuration;
    if (contentType === "video" && parseInt(displayDuration) === 0) {
      parsedDisplayDuration = 0; // Special value: play full video
    } else {
      parsedDisplayDuration = displayDuration ? Math.max(3, parseInt(displayDuration) || 10) : 10;
    }

    // Validate required fields
    if (!contentType || !title) {
      console.error("❌ Validation failed:", { contentType, title, body: req.body });
      // Cleanup any uploaded files
      files.forEach(file => {
        if (file && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {
            console.error("Error cleaning up temp file:", err);
          }
        }
      });
      return res.status(400).json({ message: "contentType and title are required" });
    }
    
    console.log("✅ Validation passed:", { contentType, title, fileCount: files.length });

    // File is optional for notifications (text-only notifications)
    if (files.length === 0 && contentType !== "notification") {
      return res.status(400).json({ message: "At least one file is required" });
    }

    // If no files but it's a notification, create a single text-only notification
    if (files.length === 0 && contentType === "notification") {
      const maxOrderDoc = await TVContent.findOne({ contentType }).sort({ displayOrder: -1 }).limit(1);
      const displayOrder = maxOrderDoc ? maxOrderDoc.displayOrder + 1 : 0;

      let parsedMetadata = {};
      if (metadata) {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch (parseError) {
          parsedMetadata = {};
        }
      }

      // For videos, use 0 if parsedDisplayDuration is 0 (play full video)
      const finalDuration = contentType === "video" && parsedDisplayDuration === 0 ? 0 : parsedDisplayDuration;
      
      const tvContent = new TVContent({
        contentType,
        title,
        mediaUrl: null,
        thumbnailUrl: null,
        mealType: null,
        displayOrder,
        displayDuration: finalDuration,
        hostelId: hostelId || null,
        scheduledStart: scheduledStart || null,
        scheduledEnd: scheduledEnd || null,
        metadata: parsedMetadata,
        uploadedBy: req.user.id,
        notificationType: notificationType || null,
        priority: priority || "medium",
        description: description || null,
      });

      await tvContent.save();
      return res.status(201).json({ 
        message: "Content uploaded successfully", 
        content: tvContent,
        count: 1 
      });
    }

    // Process multiple files - create separate content entry for each
    const uploadedContents = [];
    const errors = [];

    // Get the highest display order for this content type
    const maxOrderDoc = await TVContent.findOne({ contentType }).sort({ displayOrder: -1 }).limit(1);
    let currentDisplayOrder = maxOrderDoc ? maxOrderDoc.displayOrder + 1 : 0;

    // Parse metadata once
    let parsedMetadata = {};
    if (metadata) {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch (parseError) {
        parsedMetadata = {};
      }
    }

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let mediaUrl = null;
      let thumbnailUrl = null;

      try {
        // Create content-type specific directory
        const uploadDir = path.join(__dirname, "../uploads/tv-content", contentType);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const ext = path.extname(file.originalname);
        const filename = `${contentType}_${timestamp}_${i}_${randomStr}${ext}`;
        const finalPath = path.join(uploadDir, filename);

        // Move file from temp to final location
        fs.renameSync(file.path, finalPath);

        // Generate public URL
        mediaUrl = `/uploads/tv-content/${contentType}/${filename}`;
        console.log(`✅ File ${i + 1}/${files.length} saved locally: ${mediaUrl}`);

        // Create content entry for this file
        // Use title with file number if multiple files, or just title if single file
        const contentTitle = files.length > 1 ? `${title} (${i + 1})` : title;

        // For videos, use 0 if parsedDisplayDuration is 0 (play full video)
        const finalDuration = contentType === "video" && parsedDisplayDuration === 0 ? 0 : parsedDisplayDuration;
        
        const tvContent = new TVContent({
          contentType,
          title: contentTitle,
          mediaUrl,
          thumbnailUrl,
          mealType: mealType || null,
          displayOrder: currentDisplayOrder++,
          displayDuration: finalDuration,
          hostelId: hostelId || null,
          scheduledStart: scheduledStart || null,
          scheduledEnd: scheduledEnd || null,
          metadata: parsedMetadata,
          uploadedBy: req.user.id,
          notificationType: notificationType || null,
          priority: priority || "medium",
          description: description || null,
        });

        await tvContent.save();
        uploadedContents.push(tvContent);
      } catch (error) {
        console.error(`Error processing file ${i + 1}:`, error);
        errors.push({ fileIndex: i, fileName: file.originalname, error: error.message });
        // Cleanup failed file
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupErr) {
            console.error("Error cleaning up failed file:", cleanupErr);
          }
        }
      }
    }

    // Return response
    if (uploadedContents.length === 0) {
      return res.status(500).json({ 
        message: "Failed to upload any files", 
        errors 
      });
    }

    if (errors.length > 0) {
      return res.status(207).json({ 
        message: `Partially successful: ${uploadedContents.length} uploaded, ${errors.length} failed`, 
        content: uploadedContents.length === 1 ? uploadedContents[0] : uploadedContents,
        count: uploadedContents.length,
        errors 
      });
    }

    res.status(201).json({ 
      message: `Successfully uploaded ${uploadedContents.length} file(s)`, 
      content: uploadedContents.length === 1 ? uploadedContents[0] : uploadedContents,
      count: uploadedContents.length 
    });
  } catch (error) {
    console.error("Upload TV content error:", error);
    // Cleanup any remaining files
    const files = req.files || (req.file ? [req.file] : []);
    files.forEach(file => {
      if (file && fs.existsSync(file.path)) {
        cleanupTempFile(file.path);
      }
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-content/active
 * Fetch active content for TV display (public, no auth)
 */
router.get("/active", async (req, res) => {
  try {
    // #region agent log
    logDebug('tvContent.js:123', 'active endpoint entry', {hostelId:req.query.hostelId}, 'H1');
    // #endregion
    
    const { hostelId } = req.query;
    const now = new Date();

    // Build query for active content
    const query = {
      isActive: true,
      $or: [
        { scheduledStart: null, scheduledEnd: null }, // Always show
        { scheduledStart: { $lte: now }, scheduledEnd: { $gte: now } }, // Within schedule
      ],
    };

    // Filter by hostel if provided (treat "default" as null for global content)
    if (hostelId && hostelId !== "default") {
      query.$and = [
        {
          $or: [{ hostelId: hostelId }, { hostelId: null }], // Hostel-specific or global
        },
      ];
    } else {
      // For "default" or no hostelId, only show global content (hostelId: null)
      query.hostelId = null;
    }

    // #region agent log
    logDebug('tvContent.js:146', 'Before TVContent.find', {query:JSON.stringify(query)}, 'H1');
    // #endregion

    const content = await TVContent.find(query).sort({ displayOrder: 1 }).lean();

    // #region agent log
    logDebug('tvContent.js:148', 'After TVContent.find - success', {contentCount:content.length}, 'H1');
    // #endregion

    res.json({
      success: true,
      count: content.length,
      content,
    });
  } catch (error) {
    // #region agent log
    logDebug('tvContent.js:154', 'active endpoint error', {errorMessage:error.message,errorStack:error.stack}, 'H1');
    // #endregion
    console.error("Fetch active TV content error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-content/admin
 * List all content with filters (admin only)
 */
router.get("/admin", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const { contentType, isActive, hostelId, page = 1, limit = 20 } = req.query;

    const query = {};
    if (contentType) query.contentType = contentType;
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (hostelId) query.hostelId = hostelId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [content, total] = await Promise.all([
      TVContent.find(query)
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("uploadedBy", "name email")
        .lean(),
      TVContent.countDocuments(query),
    ]);

    res.json({
      success: true,
      content,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch admin TV content error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * GET /api/tv-content/preview/:id
 * Preview specific content (admin only)
 */
router.get("/preview/:id", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const content = await TVContent.findById(req.params.id).populate("uploadedBy", "name email");

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    res.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error("Preview TV content error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * PUT /api/tv-content/:id/toggle
 * Toggle active status (admin only)
 */
router.put("/:id/toggle", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const content = await TVContent.findById(req.params.id);

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    content.isActive = !content.isActive;
    await content.save();

    res.json({
      success: true,
      message: `Content ${content.isActive ? "activated" : "deactivated"}`,
      content,
    });
  } catch (error) {
    console.error("Toggle TV content error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * PUT /api/tv-content/:id/order
 * Update display order (admin only)
 */
router.put("/:id/order", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const { displayOrder } = req.body;

    if (displayOrder === undefined) {
      return res.status(400).json({ message: "displayOrder is required" });
    }

    const content = await TVContent.findByIdAndUpdate(
      req.params.id,
      { displayOrder: parseInt(displayOrder) },
      { new: true }
    );

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    res.json({
      success: true,
      message: "Display order updated",
      content,
    });
  } catch (error) {
    console.error("Update display order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * PUT /api/tv-content/:id
 * Update content metadata (admin only)
 */
router.put("/:id", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const { title, mealType, displayDuration, scheduledStart, scheduledEnd, metadata } = req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (mealType) updateData.mealType = mealType;
    if (displayDuration) updateData.displayDuration = displayDuration;
    if (scheduledStart !== undefined) updateData.scheduledStart = scheduledStart || null;
    if (scheduledEnd !== undefined) updateData.scheduledEnd = scheduledEnd || null;
    if (metadata) updateData.metadata = metadata;

    const content = await TVContent.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    res.json({
      success: true,
      message: "Content updated",
      content,
    });
  } catch (error) {
    console.error("Update TV content error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * DELETE /api/tv-content/:id
 * Delete content (admin only)
 */
router.delete("/:id", auth, roleCheck(["Admin"]), async (req, res) => {
  try {
    const content = await TVContent.findById(req.params.id);

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Delete file from local storage if it exists
    if (content.mediaUrl) {
      try {
        const filePath = path.join(__dirname, "..", content.mediaUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`✅ File deleted: ${filePath}`);
        }
      } catch (error) {
        console.error("File deletion error:", error);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete from database
    await content.deleteOne();

    res.json({
      success: true,
      message: "Content deleted successfully",
    });
  } catch (error) {
    console.error("Delete TV content error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
  console.error("🔴 Route error handler caught:", error);
  if (error) {
    return res.status(400).json({
      message: error.message || "Upload error",
      error: error.toString(),
      stack: error.stack,
    });
  }
  next();
});

module.exports = router;

