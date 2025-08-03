// middlewares/uploadFaceImages.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const rollNo = req.body.rollNo;
    const folderPath = path.join(__dirname, "..", "uploads", "faces", rollNo);
    fs.mkdirSync(folderPath, { recursive: true });
    cb(null, folderPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, uniqueSuffix);
  },
});

const uploadFaceImages = multer({ storage });

module.exports = uploadFaceImages;
