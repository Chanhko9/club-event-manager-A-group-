const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const pool = require("./config/db");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS connected");
    res.json({
      message: "Server is running",
      database: rows[0]
    });
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, event_time, location, description, created_at, updated_at
      FROM events
      ORDER BY event_time ASC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch events",
      error: error.message
    });
  }
});

app.post("/api/events", async (req, res) => {
  try {
    const { title, event_time, location, description } = req.body;

    if (!title || !event_time || !location) {
      return res.status(400).json({
        message: "title, event_time, location are required"
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO events (title, event_time, location, description)
      VALUES (?, ?, ?, ?)
      `,
      [title, event_time, location, description || null]
    );

    res.status(201).json({
      message: "Event created successfully",
      eventId: result.insertId
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create event",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});