// routes/syncApi.js
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const dbService = require("../services/dbService");

// Authentication route - provide credentials
router.post("/auth/credentials", async (req, res) => {
  const { clientId, accessToken } = req.body;

  if (!clientId || !accessToken) {
    logger.warn("Authentication attempt with missing credentials", {
      clientId: !!clientId,
    });
    return res.status(400).json({ error: "Missing clientId or accessToken" });
  }

  try {
    // Retrieve the credentials using the access token
    const credResult = await dbService.query(
      "SELECT db_user, db_password FROM sync_users WHERE client_id = $1 AND access_token = $2",
      [clientId, accessToken]
    );

    if (credResult.rowCount === 0) {
      logger.warn("Failed authentication attempt", { clientId });
      return res
        .status(401)
        .json({ error: "Invalid client ID or access token" });
    }

    logger.info("Successful credential retrieval", { clientId });
    // Return only database credentials, not server details
    res.json({
      dbUser: credResult.rows[0].db_user,
      dbPassword: credResult.rows[0].db_password,
    });
  } catch (error) {
    logger.error(`Error retrieving credentials: ${error.message}`, {
      error,
      clientId,
    });
    res.status(500).json({ error: "Server error" });
  }
});

// Data sync route
router.post("/sync/data", async (req, res) => {
  const { clientId, accessToken, data } = req.body;

  if (!clientId || !accessToken || !data) {
    logger.warn("Sync attempt with missing fields", {
      fields: {
        clientId: !!clientId,
        accessToken: !!accessToken,
        data: !!data,
      },
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Using transaction for multi-operation process
    await dbService.transaction(async (client) => {
      // Verify client exists and token is valid
      const clientCheck = await client.query(
        "SELECT client_id FROM sync_users WHERE client_id = $1 AND access_token = $2",
        [clientId, accessToken]
      );

      if (clientCheck.rowCount === 0) {
        logger.warn("Sync attempt with invalid credentials", { clientId });
        throw new Error("Invalid client ID or access token");
      }

      // Remove existing records for acc_master and acc_users
      await client.query("DELETE FROM acc_master WHERE client_id = $1", [
        clientId,
      ]);
      await client.query("DELETE FROM acc_users WHERE client_id = $1", [
        clientId,
      ]);

      // Insert new data
      let recordCount = 0;
      for (const row of data) {
        // First normalize the field names to ensure consistency
        const normalizedRow = {
          code: row.CODE || row.code || "",
          name: row.NAME || row.name || "",
          address: row.ADDRESS || row.address || "",
          place: row.BRANCH || row.branch || row.PLACE || row.place || "",
          super_code: row.SUPERCODE || row.super_code || row.SUPER_CODE || null,
          client_id: clientId,
        };

        // Then insert using the normalized names
        await client.query(
          `INSERT INTO acc_master (code, name, address, place, super_code, client_id) 
     VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            normalizedRow.code,
            normalizedRow.name,
            normalizedRow.address,
            normalizedRow.place,
            normalizedRow.super_code,
            normalizedRow.client_id,
          ]
        );

        // Only insert into acc_users if ID and PASS fields exist
        const userId = row.ID || row.id;
        const userPass = row.PASS || row.pass;

        if (userId && userPass) {
          await client.query(
            `INSERT INTO acc_users (id, pass, client_id) 
        VALUES ($1, $2, $3)`,
            [userId, userPass, clientId]
          );
          recordCount++;
        } else {
          logger.warn("Skipping row due to missing ID or PASS", {
            row,
            clientId,
          });
        }
      }

      // Log sync operation
      await client.query(
        "INSERT INTO sync_logs (client_id, records_synced, status, message) VALUES ($1, $2, $3, $4)",
        [clientId, recordCount, "SUCCESS", "Sync completed successfully"]
      );

      logger.info(`Successful data sync`, { clientId, recordCount });

      // Set response within transaction
      res.locals.responseData = {
        success: true,
        message: `Successfully synced ${recordCount} records`,
        recordCount,
      };
    });

    // Send response after transaction completes
    res.json(res.locals.responseData);
  } catch (error) {
    logger.error(`Error syncing data: ${error.message}`, { error, clientId });

    // Try to log the error
    try {
      await dbService.query(
        "INSERT INTO sync_logs (client_id, records_synced, status, message) VALUES ($1, $2, $3, $4)",
        [clientId, 0, "FAILED", error.message]
      );
    } catch (logError) {
      logger.error(`Failed to log error: ${logError.message}`, {
        error: logError,
      });
    }

    if (error.message === "Invalid client ID or access token") {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Server error" });
  }
});

// Log sync operation
router.post("/sync/log", async (req, res) => {
  const { clientId, accessToken, status, recordCount, message } = req.body;

  if (!clientId || !accessToken || !status) {
    logger.warn("Log attempt with missing fields", {
      fields: {
        clientId: !!clientId,
        accessToken: !!accessToken,
        status: !!status,
      },
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Verify client exists and token is valid
    const clientCheck = await dbService.query(
      "SELECT client_id FROM sync_users WHERE client_id = $1 AND access_token = $2",
      [clientId, accessToken]
    );

    if (clientCheck.rowCount === 0) {
      logger.warn("Log attempt with invalid credentials", { clientId });
      return res
        .status(401)
        .json({ error: "Invalid client ID or access token" });
    }

    // Log sync operation
    await dbService.query(
      "INSERT INTO sync_logs (client_id, records_synced, status, message) VALUES ($1, $2, $3, $4)",
      [clientId, recordCount || 0, status, message || ""]
    );

    logger.info("Sync operation logged", { clientId, status });
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error logging sync: ${error.message}`, { error, clientId });
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
