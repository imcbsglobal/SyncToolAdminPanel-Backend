// middleware/auth.js
const jwt = require("jsonwebtoken");
const dbService = require("../services/dbService");
const JWT_SECRET = process.env.JWT_SECRET;

async function requireSuperAdmin(req, res, next) {
  const token = req.cookies["superadmin_token"];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // ensure it matches the one in the DB
  const result = await dbService.query(
    `SELECT access_token FROM sync_admin WHERE id = $1`,
    [payload.adminId]
  );
  if (!result.rowCount || result.rows[0].access_token !== token) {
    return res.status(401).json({ error: "Session invalidated" });
  }

  req.adminId = payload.adminId;
  next();
}

module.exports = { requireSuperAdmin };
