// routes/syncApi.js --ADMIN SIDE
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const dbService = require("../services/dbService");

// Data sync route
router.post("/sync/data", async (req, res) => {
  const { clientId, accessToken, data } = req.body;

  // Add more comprehensive logging
  logger.info("Received sync request", {
    clientId,
    dataLength: Array.isArray(data) ? data.length : 0,
  });

  if (!clientId || !accessToken || !Array.isArray(data)) {
    logger.warn("Sync attempt with missing or invalid fields", {
      clientId: !!clientId,
      accessToken: !!accessToken,
      dataIsArray: Array.isArray(data),
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Use transaction for integrity
    const { recordCount, errors } = await dbService.transaction(
      async (client) => {
        // 1) Verify credentials
        const clientCheck = await client.query(
          "SELECT client_id FROM sync_users WHERE client_id=$1 AND access_token=$2",
          [clientId, accessToken]
        );
        logger.info(
          `Auth check: found ${clientCheck.rowCount} entries for client ${clientId}`
        );

        if (clientCheck.rowCount === 0) {
          logger.warn("Invalid credentials during sync", { clientId });
          throw new Error("UNAUTHORIZED");
        }

        // 2) Clear out old data
        await client.query("DELETE FROM acc_master WHERE client_id=$1", [
          clientId,
        ]);
        await client.query("DELETE FROM acc_users WHERE client_id=$1", [
          clientId,
        ]);
        logger.info("Cleared old data for client", { clientId });

        // 3) Insert new rows individually
        let count = 0;
        const errs = [];

        for (const row of data) {
          try {
            const userId = row.ID || row.id;
            const userPass = row.PASS || row.pass;

            if (userId && userPass) {
              // Using the composite primary key (id, client_id)
              await client.query(
                `INSERT INTO acc_users (id, pass, client_id) VALUES ($1, $2, $3)`,
                [userId, userPass, clientId]
              );
              count++;
              logger.info("Inserted acc_users row", { clientId, userId });
            } else {
              const code = row.CODE || row.code || null;
              const name = row.NAME || row.name || null;
              const address = row.ADDRESS || row.address || null;
              const place =
                row.PLACE || row.place || row.BRANCH || row.branch || null;
              const superCode =
                row.SUPERCODE || row.super_code || row.SUPER_CODE || null;

              if (!code) {
                logger.warn("Skipping master record with no code", {
                  clientId,
                  rowData: JSON.stringify(row),
                });
                continue;
              }

              // Using the composite primary key (code, client_id)
              await client.query(
                `INSERT INTO acc_master (code, name, address, place, super_code, client_id)
                VALUES($1,$2,$3,$4,$5,$6)`,
                [code, name, address, place, superCode, clientId]
              );
              count++;
              logger.info("Inserted acc_master row", { clientId, code });
            }
          } catch (rowError) {
            logger.error("Row insertion failed", {
              clientId,
              row,
              error: rowError.stack,
            });
            errs.push({ row, error: rowError.message });
          }
        }

        // Return transaction results
        return { recordCount: count, errors: errs };
      }
    );

    // 4) Log the operation
    const status = errors.length > 0 ? "PARTIAL" : "SUCCESS";
    const message =
      errors.length > 0
        ? `Sync completed with ${errors.length} error(s)`
        : "Sync completed successfully";

    try {
      await dbService.query(
        `INSERT INTO sync_logs (client_id, records_synced, status, message)
         VALUES($1,$2,$3,$4)`,
        [clientId, recordCount, status, message]
      );
      logger.info("Logged sync operation", { clientId, recordCount, status });
    } catch (logError) {
      logger.error("Failed to log sync operation", {
        clientId,
        error: logError.stack,
      });
    }

    // 5) Send response
    return res.status(200).json({
      success: true,
      message: `Successfully synced ${recordCount} records`,
      recordCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (error.message === "UNAUTHORIZED") {
      return res
        .status(401)
        .json({ error: "Invalid client ID or access token" });
    }
    logger.error("Error syncing data:", {
      clientId,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    return res
      .status(500)
      .json({ error: "Server error", details: error.message });
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

    await dbService.query(
      "INSERT INTO sync_logs (client_id, records_synced, status, message) VALUES ($1, $2, $3, $4)",
      [clientId, recordCount || 0, status, message || ""]
    );

    logger.info("Sync operation logged", { clientId, status });
    return res.json({ success: true });
  } catch (error) {
    logger.error(`Error logging sync: ${error.message}`, { error, clientId });
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
