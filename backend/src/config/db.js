const path = require("node:path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

function getRequiredEnv(key) {
  const value = process.env[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function getOptionalEnv(key, fallback) {
  const value = process.env[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

const dbConfig = {
  host: getOptionalEnv("DB_HOST", "localhost"),
  port: Number.parseInt(getOptionalEnv("DB_PORT", "3306"), 10),
  user: getRequiredEnv("DB_USER"),
  password: getRequiredEnv("DB_PASSWORD"),
  database: getRequiredEnv("DB_NAME"),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

console.log("Using .env file at:", envPath);
console.log("DB config loaded:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  passwordLength: dbConfig.password.length,
  database: dbConfig.database
});

const pool = mysql.createPool(dbConfig);

module.exports = pool;