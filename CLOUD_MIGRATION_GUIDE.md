# Cloud Storage Migration Guide

## Current Setup (Local Storage)

Currently, all TV content files (images, PDFs, videos) are stored locally in:
```
Hostel-Management-BE/uploads/tv-content/
├── notification/
├── timetable/
├── foodImage/
└── video/
```

Files are served via Express static middleware at `/uploads/tv-content/*`

## When to Migrate to Cloud (Cloudinary)

Consider migrating when:
- Server storage is limited (< 10GB available)
- You have multiple backend servers (need shared storage)
- Upload/download speeds are slow
- You want automatic image optimization
- You need CDN for faster global delivery
- Video file sizes are large (> 100MB each)

## Migration Steps

### 1. Setup Cloudinary Account

1. Create account at [cloudinary.com](https://cloudinary.com)
2. Get credentials from Dashboard
3. Add to `.env`:
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 2. Install Packages (Already Installed)

```bash
npm install cloudinary multer-storage-cloudinary
```

### 3. Update tvContent Routes

**Replace in `routes/tvContent.js`:**

Change line 4-6 from:
```javascript
const { uploadSingle, TEMP_DIR } = require("../middleware/cloudUpload");
const path = require("path");
const fs = require("fs");
```

To:
```javascript
const { uploadSingle, cleanupTempFile } = require("../middleware/cloudUpload");
const { uploadToCloudinary, deleteFromCloudinary, generateVideoThumbnail } = require("../config/cloudStorage");
```

**Replace file save logic (around line 28-50):**

From:
```javascript
// Save file locally if exists
if (req.file) {
  try {
    // Create content-type specific directory
    const uploadDir = path.join(__dirname, "../uploads/tv-content", contentType);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(req.file.originalname);
    const filename = `${contentType}_${timestamp}_${randomStr}${ext}`;
    const finalPath = path.join(uploadDir, filename);

    // Move file from temp to final location
    fs.renameSync(req.file.path, finalPath);

    // Generate public URL
    mediaUrl = `/uploads/tv-content/${contentType}/${filename}`;
    
    console.log(`✅ File saved locally: ${mediaUrl}`);
  } catch (error) {
    console.error("File save error:", error);
    return res.status(500).json({ message: "Failed to save file", error: error.message });
  }
}
```

To:
```javascript
// Upload to Cloudinary if file exists
if (req.file) {
  const uploadResult = await uploadToCloudinary(req.file.path, contentType);

  // Cleanup temp file
  cleanupTempFile(req.file.path);

  if (!uploadResult.success) {
    return res.status(500).json({ message: "Failed to upload to cloud storage", error: uploadResult.error });
  }

  mediaUrl = uploadResult.url;
  thumbnailUrl = uploadResult.thumbnailUrl;

  // Generate thumbnail for videos
  if (contentType === "video" && uploadResult.publicId) {
    thumbnailUrl = generateVideoThumbnail(uploadResult.publicId);
  }
}
```

**Replace delete logic (around line 250):**

From:
```javascript
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
```

To:
```javascript
// Extract public ID from Cloudinary URL to delete from cloud
const urlParts = content.mediaUrl.split("/");
const publicIdWithExt = urlParts.slice(-2).join("/"); // Get folder/filename
const publicId = publicIdWithExt.split(".")[0]; // Remove extension

// Delete from Cloudinary
const resourceType = content.contentType === "video" ? "video" : "image";
await deleteFromCloudinary(publicId, resourceType);
```

### 4. Migrate Existing Files (Optional)

If you have existing files to migrate:

**Create migration script:**
```bash
node scripts/migrateToCloud.js
```

**Script content (`scripts/migrateToCloud.js`):**
```javascript
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { uploadToCloudinary } = require('../config/cloudStorage');
const TVContent = require('../models/TVContent');
const connectDB = require('../config/db');

async function migrate() {
  await connectDB();
  console.log('🚀 Starting migration...');

  const contents = await TVContent.find({ mediaUrl: { $regex: '^/uploads' } });
  console.log(`Found ${contents.length} files to migrate`);

  for (const content of contents) {
    try {
      const localPath = path.join(__dirname, '..', content.mediaUrl);
      
      if (!fs.existsSync(localPath)) {
        console.log(`⚠️ File not found: ${localPath}`);
        continue;
      }

      console.log(`Uploading: ${content.title}...`);
      const result = await uploadToCloudinary(localPath, content.contentType);

      if (result.success) {
        content.mediaUrl = result.url;
        if (result.thumbnailUrl) {
          content.thumbnailUrl = result.thumbnailUrl;
        }
        await content.save();
        console.log(`✅ Migrated: ${content.title}`);
      } else {
        console.log(`❌ Failed: ${content.title} - ${result.error}`);
      }
    } catch (error) {
      console.error(`Error migrating ${content.title}:`, error);
    }
  }

  console.log('✅ Migration complete!');
  process.exit(0);
}

migrate();
```

### 5. Test

1. Restart backend server
2. Upload new content from admin app
3. Verify files appear in Cloudinary dashboard
4. Check TV display shows new content
5. Test delete functionality

### 6. Cleanup Local Files (After Migration)

```bash
# Backup first!
tar -czf tv-content-backup.tar.gz uploads/tv-content/

# Then remove old files
rm -rf uploads/tv-content/
```

## Comparison: Local vs Cloud

| Feature | Local Storage | Cloudinary |
|---------|--------------|------------|
| Setup | ✅ Simple | Requires account |
| Cost | ✅ Free (uses server storage) | Free tier: 25GB, then paid |
| Speed (same network) | ✅ Very fast | Slower (internet upload) |
| Speed (remote users) | Slow | ✅ Very fast (CDN) |
| Optimization | Manual | ✅ Automatic |
| Storage limit | Server disk space | 25GB free, unlimited paid |
| Backup | Manual | ✅ Automatic |
| Multiple servers | ❌ Not shared | ✅ Shared storage |
| Video thumbnails | Manual | ✅ Automatic |

## Recommendations

**Use Local Storage when:**
- Starting out / testing
- Small hostel (1-2 blocks)
- Limited content updates
- Server has plenty of disk space
- Single server setup

**Migrate to Cloud when:**
- Scaling up (multiple hostels)
- Frequent content updates
- Large video files
- Multiple backend servers
- Want automatic optimization
- Server storage is limited

## Rollback (Cloud to Local)

If you need to rollback:

1. Download all files from Cloudinary
2. Place in `uploads/tv-content/` folders
3. Update database URLs to local paths
4. Revert code changes in `tvContent.js`

## Cost Estimation

**Cloudinary Free Tier:**
- 25 GB storage
- 25 GB bandwidth/month
- Enough for ~1000 images or ~50 videos

**Cloudinary Plus ($89/month):**
- 100 GB storage
- 100 GB bandwidth/month
- Better for large deployments

**Local Storage Cost:**
- Server disk space only
- No bandwidth limits
- One-time server cost

## Support

For migration help:
1. Check Cloudinary docs: https://cloudinary.com/documentation
2. Review `config/cloudStorage.js` comments
3. Test with few files first before full migration

---

**Current Mode:** Local Storage  
**Ready for Cloud:** Yes (code already prepared)  
**Migration Effort:** ~1 hour for setup + script run time

