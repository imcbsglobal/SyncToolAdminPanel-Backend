// routes/admin.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const logger = require("../utils/logger");
const dbService = require("../services/dbService");

// Generate a secure token for user authentication (10 digit unique ID)
function generateClientId() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

// Generate a secure token for user authentication
function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Initialize database - use this on application start
router.get("/initialize", async (req, res) => {
  try {
    // Using the query method from dbService instead of direct connection
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS sync_users (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(50) UNIQUE NOT NULL,
        db_name VARCHAR(100) NOT NULL,
        db_user VARCHAR(100) NOT NULL,
        db_password VARCHAR(255) NOT NULL,
        access_token VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP,
        client_name TEXT,
        address TEXT,
        phone_number TEXT,
        username TEXT,
        password TEXT
      )
    `);

    await dbService.query(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(50) REFERENCES sync_users(client_id),
        sync_date TIMESTAMP NOT NULL DEFAULT NOW(),
        records_synced INTEGER,
        status VARCHAR(20) NOT NULL,
        message TEXT
      )
    `);

    // Create acc_users table
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS acc_users (
        id SERIAL PRIMARY KEY,
        pass VARCHAR(255) NOT NULL,
        client_id VARCHAR(50) NOT NULL
      )
    `);

    // Create acc_master table
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS acc_master (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50),
        name VARCHAR(255),
        address TEXT,
        place VARCHAR(255),
        super_code VARCHAR(50),
        client_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    logger.info("Database initialized successfully");
    res.json({ success: true, message: "Database initialized successfully" });
  } catch (error) {
    logger.error(`Error initializing database: ${error.message}`, { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all users
router.get("/list-users", async (req, res) => {
  try {
    const result = await dbService.query(
      "SELECT client_id, db_name, db_user, client_name, address, phone_number, username, password, created_at FROM sync_users ORDER BY created_at DESC"
    );

    res.json({ success: true, users: result.rows });
  } catch (error) {
    logger.error(`Error listing users: ${error.message}`, { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new user
router.post("/add-users", async (req, res) => {
  try {
    const {
      dbName,
      dbUser,
      dbPassword,
      clientName,
      address,
      phoneNumber,
      username,
      password,
    } = req.body;

    // Validate required fields
    if (
      !dbName ||
      !dbUser ||
      !dbPassword ||
      !password ||
      !address ||
      !clientName ||
      !phoneNumber ||
      !username
    ) {
      logger.warn("Attempt to create user with missing required fields", {
        provided: {
          dbName: !!dbName,
          dbUser: !!dbUser,
          dbPassword: !!dbPassword,
          password: !!password,
          address: !!address,
          clientName: !!clientName,
          phoneNumber: !!phoneNumber,
          username: !!username,
        },
      });
      return res.status(400).json({
        success: false,
        error: "Database name, user, and password are required",
      });
    }

    // Generate client ID automatically
    const clientId = generateClientId();

    // Using the transaction method for operations that should be atomic
    await dbService.transaction(async (client) => {
      // Check if generated client ID already exists (unlikely but possible)
      const checkResult = await client.query(
        "SELECT client_id FROM sync_users WHERE client_id = $1",
        [clientId]
      );

      if (checkResult.rowCount > 0) {
        // If exists, generate another one (recursive)
        logger.warn(`Client ID collision detected: ${clientId}`);
        throw new Error("Client ID collision - please try again");
      }

      // Generate access token for secure credential retrieval
      const accessToken = generateSecureToken();

      // Insert new user
      await client.query(
        "INSERT INTO sync_users (client_id, db_name, db_user, db_password, access_token, client_name, address, phone_number, username, password, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())",
        [
          clientId,
          dbName,
          dbUser,
          dbPassword,
          accessToken,
          clientName,
          address,
          phoneNumber,
          username,
          password,
        ]
      );

      logger.info(`Successfully created user with client ID: ${clientId}`);

      // Set response data within the transaction
      res.locals.responseData = {
        success: true,
        message: `User created successfully`,
        clientId,
        accessToken,
      };
    });

    // Send response after successful transaction
    res.json(res.locals.responseData);
  } catch (error) {
    logger.error(`Error creating user: ${error.message}`, { error });
    res
      .status(
        error.message === "Client ID collision - please try again" ? 409 : 500
      )
      .json({ success: false, error: error.message });
  }
});

// Delete a user
router.delete("/delete-users/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    logger.info(`Attempting to delete user with client ID: ${clientId}`);

    // Using transaction for deletion across multiple tables
    await dbService.transaction(async (client) => {
      //  Delete from acc_users
      await client.query("DELETE FROM acc_users WHERE client_id = $1", [
        clientId,
      ]);

      // Delete from acc_master
      await client.query("DELETE FROM acc_master WHERE client_id = $1", [
        clientId,
      ]);

      // Then delete the sync logs
      await client.query("DELETE FROM sync_logs WHERE client_id = $1", [
        clientId,
      ]);

      // Finally delete the user
      const result = await client.query(
        "DELETE FROM sync_users WHERE client_id = $1",
        [clientId]
      );

      if (result.rowCount === 0) {
        throw new Error(`No user found with client ID: ${clientId}`);
      }

      logger.info(`Successfully deleted user with client ID: ${clientId}`);

      // Set response data within the transaction
      res.locals.responseData = {
        success: true,
        message: `User with client ID ${clientId} deleted successfully`,
      };
    });

    // Send response after successful transaction
    res.json(res.locals.responseData);
  } catch (error) {
    logger.error(`Error deleting user: ${error.message}`, {
      error,
      clientId: req.params.clientId,
    });
    res
      .status(error.message.includes("No user found") ? 404 : 500)
      .json({ success: false, error: error.message });
  }
});

// Update a user
router.put("/update-users/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const {
      dbName,
      dbUser,
      dbPassword,
      clientName,
      address,
      phoneNumber,
      username,
      password,
    } = req.body;

    // Validate required fields
    if (
      !dbName ||
      !dbUser ||
      !dbPassword ||
      !clientName ||
      !address ||
      !phoneNumber ||
      !username ||
      !password
    ) {
      logger.warn("Attempt to update user with missing required fields", {
        clientId,
        provided: {
          dbName: !!dbName,
          dbUser: !!dbUser,
          dbPassword: !!dbPassword,
          clientName: !!clientName,
          address: !!address,
          phoneNumber: !!phoneNumber,
          username: !!username,
          password: !!password,
        },
      });
      return res.status(400).json({
        success: false,
        error: "All fields are required for updating the user.",
      });
    }

    // Generate new access token when updating
    const accessToken = generateSecureToken();

    const result = await dbService.query(
      `
      UPDATE sync_users 
      SET 
        db_name = $2,
        db_user = $3,
        db_password = $4,
        access_token = $5,
        client_name = $6,
        address = $7,
        phone_number = $8,
        username = $9,
        password = $10,
        updated_at = NOW()
      WHERE client_id = $1
      `,
      [
        clientId,
        dbName,
        dbUser,
        dbPassword,
        accessToken,
        clientName,
        address,
        phoneNumber,
        username,
        password,
      ]
    );

    if (result.rowCount === 0) {
      logger.warn(`No user found with client ID: ${clientId}`);
      return res.status(404).json({
        success: false,
        error: `No user found with client ID: ${clientId}`,
      });
    }

    logger.info(`Successfully updated user with client ID: ${clientId}`);
    res.json({
      success: true,
      message: `User with client ID ${clientId} updated successfully`,
      accessToken,
    });
  } catch (error) {
    logger.error(`Error updating user: ${error.message}`, {
      error,
      clientId: req.params.clientId,
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user config
router.get("/users/:clientId/config", async (req, res) => {
  try {
    const { clientId } = req.params;
    const API_URL = process.env.API_URL || "https://synctool.imcbs.com";

    const result = await dbService.query(
      "SELECT client_id, db_name, access_token FROM sync_users WHERE client_id = $1",
      [clientId]
    );

    if (result.rowCount === 0) {
      logger.warn(`No user found with client ID: ${clientId}`);
      return res.status(404).json({
        success: false,
        error: `No user found with client ID: ${clientId}`,
      });
    }

    const user = result.rows[0];

    // Create user-specific config with minimal information
    const userConfig = {
      clientId: user.client_id,
      dbName: user.db_name,
      accessToken: user.access_token,
      apiUrl: API_URL,
    };

    logger.info(`Generated config for user with client ID: ${clientId}`);
    res.json({
      success: true,
      config: userConfig,
    });
  } catch (error) {
    logger.error(`Error generating user config: ${error.message}`, {
      error,
      clientId: req.params.clientId,
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get sync logs
router.get("/logs", async (req, res) => {
  try {
    const result = await dbService.query(`
      SELECT s.id, s.client_id, s.sync_date, s.records_synced, s.status, s.message, u.db_name 
      FROM sync_logs s
      JOIN sync_users u ON s.client_id = u.client_id
      ORDER BY s.sync_date DESC
      LIMIT 100
    `);

    res.json({ success: true, logs: result.rows });
  } catch (error) {
    logger.error(`Error fetching logs: ${error.message}`, { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
