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
    const { title, event_time, location, description, email } = req.body;

    let errors = {};

    if (!title || title.trim() === "") {
      errors.title = "Tiêu đề không được để trống";
    }

    if (!event_time) {
      errors.event_time = "Thời gian không được để trống";
    }

    if (!location || location.trim() === "") {
      errors.location = "Địa điểm không được để trống";
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.email = "Email không hợp lệ";
      }
    }

    if (event_time && isNaN(Date.parse(event_time))) {
      errors.event_time = "Thời gian không hợp lệ";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ",
        errors: errors
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
      message: "Tạo sự kiện thành công",
      eventId: result.insertId
    });

  } catch (error) {
    res.status(500).json({
      message: "Lỗi server",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

