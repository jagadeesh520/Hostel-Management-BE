// middleware/cloudUpload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Temporary upload directory (files will be uploaded to Cloudinary, then deleted)
const TEMP_DIR = path.join(__dirname, "../uploads/temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Get contentType from body or query, with fallback to detect from file MIME type/extension
  let contentType = req.body?.contentType || req.query?.contentType;
  
  // If contentType is not available yet, try to detect it from the file
  // This is important because multer processes files before body fields might be fully parsed
  if (!contentType) {
    const fileExt = path.extname(file.originalname || "").toLowerCase();
    const videoExts = [".mp4", ".m4v", ".mp4v", ".mpeg", ".mpg", ".mpe", ".m2v", ".mov", ".qt", ".webm", ".avi", ".mkv", ".3gp", ".3g2", ".flv", ".f4v", ".ogg", ".ogv", ".ogm", ".wmv", ".asf", ".vob", ".mts", ".m2ts", ".ts"];
    const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
    const pdfExts = [".pdf"];
    
    // Check MIME type first (most reliable)
    if (file.mimetype) {
      if (file.mimetype.startsWith("video/") || file.mimetype === "application/octet-stream") {
        // If it's a video MIME type, or generic octet-stream with video extension, treat as video
        if (file.mimetype.startsWith("video/") || videoExts.includes(fileExt)) {
          contentType = "video";
        }
      } else if (file.mimetype.startsWith("image/")) {
        // If it's an image MIME type but has video extension, it might be mislabeled - check extension
        contentType = videoExts.includes(fileExt) ? "video" : "foodImage";
      } else if (file.mimetype === "application/pdf") {
        contentType = "timetable";
      }
    }
    
    // Fallback to extension-based detection if MIME type didn't help
    if (!contentType) {
      if (videoExts.includes(fileExt)) {
        contentType = "video";
      } else if (imageExts.includes(fileExt)) {
        contentType = "foodImage";
      } else if (pdfExts.includes(fileExt)) {
        contentType = "timetable";
      }
    }
    
    // Log detection for debugging
    if (!contentType) {
      console.warn(`[cloudUpload] Could not detect contentType for file: ${file.originalname}, MIME: ${file.mimetype}, Ext: ${fileExt}`);
    } else {
      console.log(`[cloudUpload] Detected contentType: ${contentType} for file: ${file.originalname}, MIME: ${file.mimetype}, Ext: ${fileExt}`);
    }
  }

  // Define allowed types - comprehensive list
  const imageTypes = [
    "image/jpeg", 
    "image/jpg", 
    "image/png", 
    "image/webp",
    "image/gif", // Add GIF support
    "image/bmp"  // Add BMP support
  ];
  
  const videoTypes = [
    "video/mp4",
    "video/x-m4v", // MP4 variant
    "video/mp4v-es", // MP4 variant
    "video/mpeg",
    "video/mpg", // MPEG variant
    "video/quicktime", // MOV
    "video/x-quicktime", // MOV variant
    "video/webm",
    "video/x-msvideo", // AVI
    "video/avi", // AVI variant
    "video/x-matroska", // MKV
    "video/mkv", // MKV variant
    "video/3gpp", // 3GP
    "video/3gp", // 3GP variant
    "video/x-flv", // FLV
    "video/flv", // FLV variant
    "video/ogg", // OGG
    "video/ogv", // OGG variant
    "video/x-ms-wmv", // WMV
    "video/wmv", // WMV variant
    "application/octet-stream" // Some systems use this for videos
  ];
  
  const pdfTypes = ["application/pdf"];

  // Also check file extension as fallback (some systems don't set MIME type correctly)
  const fileExt = path.extname(file.originalname || "").toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
  const videoExts = [
    ".mp4", ".m4v", ".mp4v", // MP4 variants
    ".mpeg", ".mpg", ".mpe", ".m2v", // MPEG variants
    ".mov", ".qt", // QuickTime/MOV
    ".webm", // WebM
    ".avi", // AVI
    ".mkv", // Matroska/MKV
    ".3gp", ".3g2", // 3GP variants
    ".flv", ".f4v", // Flash video
    ".ogg", ".ogv", ".ogm", // OGG variants
    ".wmv", ".asf", // Windows Media
    ".vob", ".mts", ".m2ts", ".ts", // Other video formats
  ];
  const pdfExts = [".pdf"];

  if (contentType === "video") {
    // Check MIME type or file extension
    const isValidMime = videoTypes.includes(file.mimetype);
    const isValidExt = videoExts.includes(fileExt);
    
    // Also check if mimetype is undefined/null but extension is valid (some systems don't set MIME type)
    const hasValidVideoExt = videoExts.includes(fileExt);
    
    if (isValidMime || isValidExt || (hasValidVideoExt && (!file.mimetype || file.mimetype === "application/octet-stream"))) {
      cb(null, true);
    } else {
      cb(new Error(`Video format not supported. Allowed formats: MP4, MOV, MKV, WEBM, AVI, 3GP, FLV, OGG, WMV, etc. Detected: ${file.mimetype || 'unknown'} (${fileExt || 'no extension'})`), false);
    }
  } else if (contentType === "timetable") {
    // Timetables can be images or PDFs
    const isValidMime = [...imageTypes, ...pdfTypes].includes(file.mimetype);
    const isValidExt = [...imageExts, ...pdfExts].includes(fileExt);
    
    if (isValidMime || isValidExt) {
      cb(null, true);
    } else {
      cb(new Error("Only images (JPEG, PNG, WEBP) or PDF files are allowed for timetables"), false);
    }
  } else if (contentType === "notification") {
    // Notifications can be images (optional)
    const isValidMime = imageTypes.includes(file.mimetype);
    const isValidExt = imageExts.includes(fileExt);
    
    if (isValidMime || isValidExt || !file.mimetype) {
      cb(null, true); // Allow if no file (text-only notification)
    } else {
      cb(new Error("Only image files (JPEG, PNG, WEBP) are allowed for notifications"), false);
    }
  } else {
    // For menu and food images, only allow images
    // But first check if this is actually a video file that was misclassified
    const isVideoMime = file.mimetype && (file.mimetype.startsWith("video/") || videoTypes.includes(file.mimetype));
    const isVideoExt = videoExts.includes(fileExt);
    
    if (isVideoMime || isVideoExt) {
      // This is clearly a video file, but contentType wasn't set to "video"
      // Allow it anyway but log a warning
      console.warn(`[cloudUpload] Video file detected but contentType is "${contentType || 'unknown'}". Allowing video file: ${file.originalname}`);
      cb(null, true);
      return;
    }
    
    const isValidMime = imageTypes.includes(file.mimetype);
    const isValidExt = imageExts.includes(fileExt);
    
    if (isValidMime || isValidExt) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files (JPEG, PNG, WEBP, GIF, BMP) are allowed for ${contentType || 'this content type'}. Detected: MIME=${file.mimetype || 'unknown'}, Ext=${fileExt || 'none'}`), false);
    }
  }
};

// Configure multer limits
const limits = {
  fileSize: 100 * 1024 * 1024, // 100MB max
};

// Create multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits,
});

// Middleware to handle single file upload
const uploadSingle = (fieldName = "file") => {
  return (req, res, next) => {
    const uploader = upload.single(fieldName);
    uploader(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "File too large. Maximum size is 100MB",
          });
        }
        return res.status(400).json({
          message: `Upload error: ${err.message}`,
        });
      } else if (err) {
        return res.status(400).json({
          message: err.message || "Upload error",
        });
      }
      next();
    });
  };
};

// Middleware to handle multiple files upload (allows zero files for optional uploads)
const uploadMultiple = (fieldName = "files", maxCount = 10) => {
  return (req, res, next) => {
    console.log(`🟡 Multer uploadMultiple middleware called for field: ${fieldName}`);
    console.log(`   Content-Type: ${req.headers['content-type']}`);
    const uploader = upload.array(fieldName, maxCount);
    uploader(req, res, (err) => {
      console.log(`🟡 Multer callback - Error:`, err ? err.message : 'None');
      console.log(`   Files received:`, req.files ? req.files.length : 0);
      if (err instanceof multer.MulterError) {
        // If no files were provided, that's OK - set req.files to empty array
        if (err.code === "LIMIT_UNEXPECTED_FILE" || err.message?.includes("Unexpected field")) {
          req.files = [];
          return next();
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "File too large. Maximum size is 100MB per file",
          });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            message: `Too many files. Maximum is ${maxCount} files`,
          });
        }
        return res.status(400).json({
          message: `Upload error: ${err.message}`,
        });
      } else if (err) {
        // If it's a "no file" error, that's OK for optional uploads
        if (err.message?.includes("No such file") || err.message?.includes("Unexpected field")) {
          req.files = [];
          return next();
        }
        return res.status(400).json({
          message: err.message || "Upload error",
        });
      }
      // Ensure req.files is always an array (even if empty)
      if (!req.files) {
        req.files = [];
      }
      next();
    });
  };
};

// Cleanup temporary file
const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Error cleaning up temp file:", error);
  }
};

// Validate video duration (should be <= 60 seconds)
const validateVideoDuration = async (filePath) => {
  // This is a simple check. For production, consider using ffmpeg or similar
  // For now, we'll rely on Cloudinary's metadata after upload
  return true; // Placeholder
};

// Middleware to handle optional single file upload (for notifications)
const uploadOptional = (fieldName = "file") => {
  return (req, res, next) => {
    const uploader = upload.single(fieldName);
    uploader(req, res, (err) => {
      if (err) {
        // If it's a "no file" error, that's OK - file is optional
        if (err.code === "LIMIT_UNEXPECTED_FILE" || 
            err.message?.includes("Unexpected field") ||
            err.message?.includes("No such file")) {
          // File is optional, continue without file
          req.file = null;
          return next();
        }
        
        // Handle other multer errors
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              message: "File too large. Maximum size is 100MB",
            });
          }
          return res.status(400).json({
            message: `Upload error: ${err.message}`,
          });
        }
        
        // Handle file filter errors
        return res.status(400).json({
          message: err.message || "Upload error",
        });
      }
      next();
    });
  };
};

module.exports = {
  uploadSingle,
  uploadOptional,
  uploadMultiple,
  cleanupTempFile,
  validateVideoDuration,
  TEMP_DIR,
};

