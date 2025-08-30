const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const authHeader = req.header("Authorization");

  console.log("🔐 Auth middleware triggered");
  console.log("👉 Auth header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ message: "Authorization header missing or malformed" });
  }

  // Extract token and remove any surrounding quotes
  let token = authHeader.split(" ")[1];
  console.log("👉 Raw token:", token);
  
  // Remove surrounding quotes if present
  if (token.startsWith('"') && token.endsWith('"')) {
    token = token.slice(1, -1);
    console.log("👉 Unquoted token:", token);
  }
  
  // Check if JWT_SECRET is set
  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET is not set in environment variables");
    return res.status(500).json({ message: "Server configuration error" });
  }
  
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
  if (!req.user || !req.user.role) {
    return res.status(403).json({ message: "Access denied: no role in token" });
  }
console.log("👉 req.user from token:", req.user);

  const userRole = req.user.role.toLowerCase();
  const allowed = roles.map(r => r.toLowerCase());

  if (!allowed.includes(userRole)) {
    return res.status(403).json({ message: "Access denied: insufficient role" });
  }

  next();
};


console.log("✅ auth.js loaded");
console.log("typeof auth:", typeof auth);
console.log("typeof roleCheck:", typeof roleCheck);

module.exports = { auth, roleCheck };