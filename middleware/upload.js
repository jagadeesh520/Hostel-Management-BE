const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload folder exists
const folder = "uploads/faces";
if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, folder);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  },
});

const upload = multer({ storage });
module.exports = upload;
