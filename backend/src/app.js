const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const pool = require("./config/db");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

<<<<<<< HEAD
function validateEventPayload(payload) {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const location = typeof payload.location === "string" ? payload.location.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const eventTime = payload.event_time;

  if (!title || !eventTime || !location) {
    return {
      isValid: false,
      message: "title, event_time, location are required"
    };
  }

  const parsedDate = new Date(eventTime);
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      isValid: false,
      message: "event_time is invalid"
    };
  }

  return {
    isValid: true,
    data: {
      title,
      event_time: eventTime,
      location,
      description: description || null
    }
  };
}

=======
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
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
<<<<<<< HEAD
    const validation = validateEventPayload(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const { title, event_time, location, description } = validation.data;

=======
    const { title, event_time, location, description } = req.body;

    if (!title || !event_time || !location) {
      return res.status(400).json({
        message: "title, event_time, location are required"
      });
    }

>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
    const [result] = await pool.query(
      `
      INSERT INTO events (title, event_time, location, description)
      VALUES (?, ?, ?, ?)
      `,
<<<<<<< HEAD
      [title, event_time, location, description]
=======
      [title, event_time, location, description || null]
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
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

<<<<<<< HEAD
app.put("/api/events/:id", async (req, res) => {
  try {
    const eventId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    const validation = validateEventPayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const { title, event_time, location, description } = validation.data;

    const [result] = await pool.query(
      `
      UPDATE events
      SET title = ?, event_time = ?, location = ?, description = ?
      WHERE id = ?
      `,
      [title, event_time, location, description, eventId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Event not found"
      });
    }

    res.json({
      message: "Event updated successfully",
      eventId
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update event",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
=======
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
