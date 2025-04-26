const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const logger = require("./utils/logger");
const adminRouter = require("./routes/admin");
const syncApiRouter = require("./routes/syncApi");

// Load environment variables
dotenv.config();

// Initialize app
const app = express();

// Security and optimization middleware for production
if (process.env.NODE_ENV === "production") {
  // Enable compression
  app.use(compression());

  // Security headers
  app.use(helmet());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: "Too many requests, please try again later",
    },
  });
  app.use(limiter);
}

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Standard middleware
app.use(bodyParser.json());
app.use(cookieParser());

// Request timeouts
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(503).json({ success: false, error: "Request timed out" });
  });
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });
  next();
});

// Routes
app.use("/api/admin", adminRouter);
app.use("/api", syncApiRouter);

// API test route
app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { error: err });
  res
    .status(500)
    .json({ success: false, error: "An unexpected error occurred" });
});

// Start server
const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  logger.info(
    `Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { reason });
});
