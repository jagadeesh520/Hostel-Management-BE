const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const path = require("path");

dotenv.config();
connectDB();

const app = express();
app.use(express.json());

const cors = require("cors");
app.use(cors({
  origin: "*",        // allow all origins for now (for testing)
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

console.log('Environment variables loaded:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');

app.use("/api/auth", require("./routes/authRoutes"));
//app.use("/api/dashboard", require("./routes/protectedRoutes")); 
// for role-checking
try {
  const protectedRoutes = require("./routes/protectedRoutes");
  app.use("/api/dashboard", protectedRoutes);
} catch (error) {
  console.error("❌ Error loading protectedRoutes.js:", error.message);
}

app.use("/api/hostels", require("./routes/hostelRoutes"));

app.use("/api/wardens", require("./routes/wardenRoutes"));

app.use("/api/students", require("./routes/studentRoutes"));

app.use("/api/attendance", require("./routes/attendance"));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/payment', require('./routes/payment'));
app.use('/api/paymentWebhook', require('./routes/paymentWebhook'));

app.use('/api/achievements',require('./routes/achievements'))

app.get('/', (req, res) => {
  res.send('Hostel Management API is running');
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
