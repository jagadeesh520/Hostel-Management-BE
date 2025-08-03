const express = require('express');
const router = express.Router();
const IssueTicket = require('../models/IssueTicket');
const upload = require('../middleware/upload');

// POST /api/issueTicket
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

router.post(
  "/tickets/:id/resolve",
  upload.single("resolutionImage"),
  async (req, res) => {
    try {
      const ticket = await IssueTicket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Not found" });

      ticket.status = "Resolved";
      ticket.reply = req.body.reply;
      if (req.file) ticket.resolutionImage = req.file.filename;

      await ticket.save();
      res.json({ message: "Ticket resolved", ticket });
    } catch (err) {
      console.error("Resolve error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
