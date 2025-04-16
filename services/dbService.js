// services/dbService.js
const { Client, Pool } = require("pg");
const logger = require("../utils/logger");
const dotenv = require("dotenv");

dotenv.config();

// Database connection pool for frequent connections
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === "true",
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
});

// Log pool errors
pool.on("error", (err, client) => {
  logger.error("Unexpected error on idle client", { error: err });
});

// Test DB connection
(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    logger.info("✅ Database connected successfully at", {
      time: res.rows[0].now,
    });
  } catch (error) {
    logger.error("❌ Failed to connect to the database", { error });
  }
})();

// For single connection (when needed)
async function getClient() {
  const client = new Client({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: process.env.PG_SSL === "true",
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`, { error });
    throw error;
  }
}

// Execute a query using the connection pool
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug("Executed query", {
      text,
      duration,
      rows: res.rowCount,
    });

    return res;
  } catch (error) {
    logger.error(`Query error: ${error.message}`, {
      error,
      text,
      params,
    });
    throw error;
  }
}

// Transaction support
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`Transaction error: ${error.message}`, { error });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getClient,
  query,
  transaction,
  pool,
};
