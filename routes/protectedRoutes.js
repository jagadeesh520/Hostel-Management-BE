// routes/protectedRoutes.js
console.log("✅ protectedRoutes.js loaded");

const express = require("express");
const router = express.Router();
const { auth, roleCheck } = require("../middleware/auth");

console.log("auth:", typeof auth);                  // Should log: "function"
console.log("roleCheck:", typeof roleCheck);        // Should log: "function"
console.log("roleCheck(['Admin']):", typeof roleCheck(["Admin"]));  // Should log: "function"

// Admin only
router.get("/admin-dashboard", auth, roleCheck(["admin"]), (req, res) => {
  res.send("Welcome Admin");
});

// Warden only
router.get("/warden-dashboard", auth, roleCheck(["warden"]), (req, res) => {
  res.send("Welcome Warden");
});

// Student only
router.get("/student-dashboard", auth, roleCheck(["student"]), (req, res) => {
  res.send("Welcome Student");
});

module.exports = router;
