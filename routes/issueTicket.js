// routes/issueTicket.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const IssueTicket = require("../models/IssueTicket");
// const auth = require("../middleware/auth");
// const roleCheck = require("../middleware/roleCheck");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads", "faces")),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`)
});
const upload = multer({ storage });

// LIST (you already have)
/*
router.get("/tickets", async (req,res)=>{ ... })
*/

// ADMIN: assign ticket to warden
// POST /api/issueTicket/tickets/:id/assign

router.post('/tickets', upload.single('image'), async (req, res) => {
     console.log("req",req.body)

  try {
    const { issueType, description, rollNo } = req.body;
    console.log("req",req.body)

    if (!issueType || !description || !rollNo) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const newIssue = new IssueTicket({
      issueType,
      description,
      rollNo,
      imagePath: req.file ? req.file.filename : null,
    });

    await newIssue.save();
    res.status(201).json({ message: 'Issue ticket submitted successfully', ticket: newIssue });
  } catch (error) {
    console.error('Issue Ticket Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get("/tickets", async (req, res) => {
  try {
    const tickets = await IssueTicket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/tickets/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { wardenId } = req.body;
    if (!wardenId) return res.status(400).json({ message: "wardenId required" });

    const ticket = await IssueTicket.findByIdAndUpdate(
      id,
      { $set: { assignedWarden: wardenId, assignedAt: new Date(), status: "Assigned" } },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json({ message: "Assigned", ticket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});




// WARDEN: fetch my assigned tickets
router.get(
  "/tickets/my",
  // auth, roleCheck(["Warden"]),
  async (req, res) => {
    try {
      const { wardenId } = req.query; // or derive from req.user._id
      if (!wardenId) return res.status(400).json({ message: "wardenId required" });

      const tickets = await IssueTicket
        .find({ assignedWarden: wardenId, status: { $in: ["Assigned", "WardenFixed"] } })
        .sort({ createdAt: -1 });

      res.json(tickets);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// WARDEN: upload proof & mark "WardenFixed"
router.post(
  "/tickets/:id/warden-fix",
  // auth, roleCheck(["Warden"]),
  upload.single("resolutionImage"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const reply = req.body.reply || "";
      const fileName = req.file?.filename;

      const update = {
        wardenReply: reply,
        wardenFixedAt: new Date(),
        status: "WardenFixed",
      };
      if (fileName) update.resolutionImage = fileName;

      const ticket = await IssueTicket.findByIdAndUpdate(id, { $set: update }, { new: true });
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json({ message: "Warden fix saved", ticket });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ADMIN: final resolve
router.put(
  "/tickets/:id/resolve",
  // auth, roleCheck(["Admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const ticket = await IssueTicket.findByIdAndUpdate(
        id,
        { $set: { status: "Resolved", resolvedAt: new Date() } },
        { new: true }
      );
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json({ message: "Resolved", ticket });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/issueTicket/tickets  -> return all tickets (admin)
router.get("/tickets", async (req, res) => {
  try {
    const tickets = await IssueTicket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (e) {
    console.error("GET /tickets error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// (Optional) Backward-compat aliases — keep these until your apps are updated
router.get("/", async (req, res) => {
  try {
    const tickets = await IssueTicket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});
router.get("/list", async (req, res) => {
  try {
    const tickets = await IssueTicket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
