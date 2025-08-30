// routes/menu.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Menu = require("../models/Menu");

const router = express.Router();

/** ---------------------------
 * Uploads config (multer)
 * --------------------------- */
const UPLOAD_DIR = path.join(__dirname, "../uploads/menu");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPEG/PNG/WEBP images are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
});

// Catch Multer errors BEFORE the handler (prevents "Network Error")
const handleUpload = (req, res, next) => {
  // allow both "images" and "images[]" field names
  const uploader = upload.fields([{ name: "images" }, { name: "images[]"}]);
  uploader(req, res, (err) => {
    if (err) {
      console.error("MULTER ERROR:", err);
      return res.status(400).json({ message: err.message || "Upload error" });
    }
    next();
  });
};

/** Helper: IST YYYY-MM-DD */
function todayIST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 60 * 60 * 1000);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * POST /api/menu
 * Accepts JSON or multipart/form-data as described earlier.
 */
router.post(
  "/",
  handleUpload,
  async (req, res) => {
    try {
      const isMultipart = req.is("multipart/form-data");
      const date = req.body?.date || todayIST();
      const blockName = req.body?.blockName;

      let itemsRaw = req.body?.items;
      let items;

      if (typeof itemsRaw === "string") {
        try {
          items = JSON.parse(itemsRaw);
        } catch {
          return res.status(400).json({ message: "Invalid items JSON." });
        }
      } else {
        items = itemsRaw;
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items are required." });
      }

      // Gather files from either field name
      const filesArr =
        (req.files?.images || req.files?.["images[]"] || []).map((f) => f);

      const publicBase = "/uploads/menu/"; // ensure static serve

      const normalizedItems = items.map((it, idx) => {
        const name = (it?.name || "").trim();
        const category = (it?.category || "").trim();
        if (!name || !category) {
          throw new Error(`Invalid item at index ${idx}: name and category are required`);
        }

        let imageUrl = it?.imageUrl || undefined;
        if (typeof imageUrl === "string" && imageUrl.trim() === "") imageUrl = undefined;

        if (!imageUrl && isMultipart && it?.imageIndex !== null && it?.imageIndex !== undefined) {
          const file = filesArr[Number(it.imageIndex)];
          if (file) imageUrl = publicBase + file.filename;
        }

        return { name, category, imageUrl };
      });

      const filter = { date };
      if (blockName) filter.blockName = blockName;

      const doc = await Menu.findOneAndUpdate(
        filter,
        {
          $set: {
            date,
            blockName: blockName || undefined,
            items: normalizedItems,
            // createdBy: req.user?._id,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.json({ message: "Menu saved", menu: doc });
    } catch (err) {
      console.error("POST /api/menu error:", err);
      res.status(500).json({ message: err?.message || "Server error" });
    }
  }
);

/**
 * GET /api/menu
 */
router.get("/", async (req, res) => {
  try {
    const { date, blockName } = req.query;
    if (!date) return res.status(400).json({ message: "date is required" });

    const query = { date };
    if (blockName) query.blockName = blockName;

    const menu = await Menu.findOne(query);
    res.json(menu || { date, items: [] });
  } catch (err) {
    console.error("GET /api/menu error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/menu/item   (query string)
router.delete("/item", async (req, res) => {
  try {
    const { date, category, name, blockName } = req.query;
    if (!date || !category || !name) {
      return res.status(400).json({ message: "date, category, and name are required" });
    }

    const filter = { date };
    if (blockName) filter.blockName = blockName;

    const menu = await Menu.findOne(filter);
    if (!menu) return res.status(404).json({ message: "Menu not found for date" });

    const before = menu.items.length;
    menu.items = menu.items.filter(
      (it) => !(it.category === category && it.name === name)
    );

    if (menu.items.length === before) {
      return res.status(404).json({ message: "Item not found in menu" });
    }

    await menu.save();
    return res.json({ message: "Item deleted", items: menu.items });
  } catch (err) {
    console.error("DELETE /api/menu/item error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/menu/removeItem  (body)
router.post("/removeItem", async (req, res) => {
  try {
    const { date, category, name, blockName } = req.body || {};
    if (!date || !category || !name) {
      return res.status(400).json({ message: "date, category, and name are required" });
    }

    const filter = { date };
    if (blockName) filter.blockName = blockName;

    const menu = await Menu.findOne(filter);
    if (!menu) return res.status(404).json({ message: "Menu not found for date" });

    const before = menu.items.length;
    menu.items = menu.items.filter(
      (it) => !(it.category === category && it.name === name)
    );

    if (menu.items.length === before) {
      return res.status(404).json({ message: "Item not found in menu" });
    }

    await menu.save();
    return res.json({ message: "Item deleted", items: menu.items });
  } catch (err) {
    console.error("POST /api/menu/removeItem error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
