// services/dbService.js
const { Client, Pool } = require("pg");
const logger = require("../utils/logger");
const dotenv = require("dotenv");

dotenv.config();

// Pool connection
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
});

// Pool error logs
pool.on("error", (err) => {
  logger.error("Unexpected error on idle client", { error: err });
});

// Test connection
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

// Single client
async function getClient() {
  const client = new Client({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`, { error });
    throw error;
  }
}

// Query function
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

// Transaction function
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
