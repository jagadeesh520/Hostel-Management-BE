const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const path = require("path");
const cors = require("cors");

dotenv.config();

const { startBillingScheduler } = require('./schedulers/billingScheduler');

async function startServer() {
  try {
    // 1. Connect DB first
    await connectDB();
    console.log("✅ MongoDB connected");

    const app = express();
    // Increase body size limits for file uploads (500MB total, 100MB per file)
    app.use(express.json({ limit: '500mb' }));
    app.use(express.urlencoded({ extended: true, limit: '500mb' }));

    app.use(cors({
      origin: "*",        // allow all origins for now (for testing)
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }));

    console.log('Environment variables loaded:');
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');

    // Routes
    app.use("/api/auth", require("./routes/authRoutes"));
    try {
      const protectedRoutes = require("./routes/protectedRoutes");
      app.use("/api/dashboard", protectedRoutes);
    } catch (error) {
      console.error("❌ Error loading protectedRoutes.js:", error.message);
    }

    app.use("/api/hostels", require("./routes/hostelRoutes"));
    app.use("/api/hostelOfficerLogin", require("./routes/hostelOfficerLogin"));
    app.use("/api/wardens", require("./routes/wardenRoutes"));
    app.use("/api/students", require("./routes/studentRoutes"));
    app.use("/api/attendance", require("./routes/attendance"));
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    app.use('/tv-display', express.static(path.join(__dirname, 'public/tv-display')));
    app.use("/api/studentAuth", require("./routes/studentAuthRoutes"));
    app.use("/api/timesheetRoutes", require("./routes/timesheetRoutes"));
    app.use("/api/issueTicket", require("./routes/issueTicket"));
    app.use("/api/blog", require("./routes/blog"));
    app.use("/api/menu", require("./routes/menu"));
    app.use("/api/adminRates", require("./routes/adminRates"));
    app.use("/api/campusLocation", require("./routes/campusLocation"));
    app.use("/api/upi", require("./routes/upiRoutes"));
    app.use('/api/leave', require('./routes/leave'));
    app.use('/api/mess', require('./routes/mess'));
    app.use('/api/establishment', require('./routes/establishment'));
    //app.use('/api/payment', require('./routes/payment'));
    app.use('/api/paymentWebhook', require('./routes/paymentWebhook'));
    app.use('/api/achievements', require('./routes/achievements'));
    app.use('/api/uploadChallan', require('./routes/uploadChallan'));
    app.use('/api/challans', require('./routes/challans'));
    app.use('/api/adminSbiUpload', require('./routes/adminSbiUpload'));
    app.use('/api/dues', require('./routes/dues'));
    app.use('/api/challanaPayments', require('./routes/challanaPayments'));
    app.use("/api/billing", require("./routes/billing"));
    app.use("/api/tv-content", require("./routes/tvContent"));
    app.use("/api/tv-analytics", require("./routes/tvAnalytics"));
    app.use("/api/tv-display-config", require("./routes/tvDisplayConfig"));

    // Health route
    app.get('/', (req, res) => {
      res.send('Hostel Management API is running');
    });

    // 2. Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // 3. Start scheduler AFTER server & DB ready
    startBillingScheduler();

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
