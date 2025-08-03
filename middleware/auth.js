const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const authHeader = req.header("Authorization");

  // Log the full header for debugging
  console.log("🔐 Auth middleware triggered");
  console.log("👉 Auth header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization header missing or malformed" });
  }

  const token = authHeader.split(" ")[1];
  console.log("👉 token:", token);
  console.log("JWT_SECRET in middleware:", process.env.JWT_SECRET);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Decoded JWT:", decoded);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

const roleCheck = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied: insufficient role" });
  }
  next();
};

// ✅ Move logs here for confirmation
console.log("✅ auth.js loaded");
console.log("typeof auth:", typeof auth);         // should be function
console.log("typeof roleCheck:", typeof roleCheck); // should be function

module.exports = { auth, roleCheck };
