// routes/syncApi.js --ADMIN SIDE
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const dbService = require("../services/dbService");

// Authentication route - provide credentials
// router.post("/auth/credentials", async (req, res) => {
//   const { clientId, accessToken } = req.body;

//   if (!clientId || !accessToken) {
//     logger.warn("Authentication attempt with missing credentials", {
//       clientId: !!clientId,
//     });
//     return res.status(400).json({ error: "Missing clientId or accessToken" });
//   }

//   try {
//     // Retrieve the credentials using the access token
//     const credResult = await dbService.query(
//       "SELECT db_user, db_password FROM sync_users WHERE client_id = $1 AND access_token = $2",
//       [clientId, accessToken]
//     );

//     if (credResult.rowCount === 0) {
//       logger.warn("Failed authentication attempt", { clientId });
//       return res
//         .status(401)
//         .json({ error: "Invalid client ID or access token" });
//     }

//     logger.info("Successful credential retrieval", { clientId });
//     // Return only database credentials, not server details
//     res.json({
//       dbUser: credResult.rows[0].db_user,
//       dbPassword: credResult.rows[0].db_password,
//     });
//   } catch (error) {
//     logger.error(`Error retrieving credentials: ${error.message}`, {
//       error,
//       clientId,
//     });
//     res.status(500).json({ error: "Server error" });
//   }
// });

// Data sync route
router.post("/sync/data", async (req, res) => {
  const { clientId, accessToken, data } = req.body;

  if (!clientId || !accessToken || !Array.isArray(data)) {
    logger.warn("Sync attempt with missing or invalid fields", {
      clientId: !!clientId,
      accessToken: !!accessToken,
      dataIsArray: Array.isArray(data),
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  let responsePayload = null;

  try {
    await dbService.transaction(async (client) => {
      // 1) Verify credentials
      const clientCheck = await client.query(
        "SELECT client_id FROM sync_users WHERE client_id=$1 AND access_token=$2",
        [clientId, accessToken]
      );
      if (clientCheck.rowCount === 0) {
        logger.warn("Invalid credentials during sync", { clientId });
        throw new Error("UNAUTHORIZED");
      }

      // 2) Clear out old data
      await client.query("DELETE FROM acc_master WHERE client_id=$1", [
        clientId,
      ]);
      await client.query("DELETE FROM acc_users  WHERE client_id=$1", [
        clientId,
      ]);

      // 3) Insert new rows, dispatching by row type
      let recordCount = 0;

      for (const row of data) {
        const userId = row.ID || row.id;
        const userPass = row.PASS || row.pass;

        if (userId && userPass) {
          // ——> User row
          try {
            logger.info("Inserting acc_users row", { userId, clientId, row });
            await client.query(
              `INSERT INTO acc_users (id, pass, client_id) VALUES ($1, $2, $3)`,
              [userId, userPass, clientId]
            );
            recordCount++;
          } catch (e) {
            logger.error("❌ acc_users insert failed", {
              clientId,
              row,
              error: e.stack || e.message,
            });
            throw e;
          }
        } else {
          // ——> Master row
          const code = row.CODE || row.code || null;
          const name = row.NAME || row.name || null;
          const address = row.ADDRESS || row.address || null;
          const place =
            row.PLACE || row.place || row.BRANCH || row.branch || null;
          const superCode =
            row.SUPERCODE || row.super_code || row.SUPER_CODE || null;

          try {
            logger.info("Inserting acc_master row", {
              code,
              name,
              clientId,
              row,
            });
            await client.query(
              `INSERT INTO acc_master
                   (code, name, address, place, super_code, client_id)
                 VALUES($1,$2,$3,$4,$5,$6)`,
              [code, name, address, place, superCode, clientId]
            );
            recordCount++;
          } catch (e) {
            logger.error("❌ acc_master insert failed", {
              clientId,
              row,
              error: e.stack || e.message,
            });
            throw e;
          }
        }
      }

      // 4) Log the operation
      await client.query(
        `INSERT INTO sync_logs
           (client_id, records_synced, status, message)
         VALUES($1,$2,$3,$4)`,
        [clientId, recordCount, "SUCCESS", "Sync completed successfully"]
      );
      logger.info("Successful data sync", { clientId, recordCount });

      // 5) Prepare the response
      responsePayload = {
        success: true,
        message: `Successfully synced ${recordCount} records`,
        recordCount,
      };
    });

    // 6) Send back to client
    return res.status(200).json(responsePayload);
  } catch (error) {
    logger.error("Error syncing data:", { clientId, error });

    // Attempt to log failure
    try {
      await dbService.query(
        `INSERT INTO sync_logs
           (client_id, records_synced, status, message)
         VALUES($1,$2,$3,$4)`,
        [clientId, 0, "FAILED", error.message]
      );
    } catch (logErr) {
      logger.error("Failed to log sync error:", logErr);
    }

    if (error.message === "UNAUTHORIZED") {
      return res
        .status(401)
        .json({ error: "Invalid client ID or access token" });
    }
    return res.status(500).json({ error: "Server error" });
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
