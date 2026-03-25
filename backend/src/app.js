const path = require("node:path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;
const frontendDir = path.resolve(__dirname, "../../frontend");

app.use(cors());
app.use(express.json());

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeStudentId(value) {
  return normalizeText(value).toUpperCase();
}

function parsePositiveInteger(value) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function validateEventPayload(payload) {
  const title = normalizeText(payload.title);
  const location = normalizeText(payload.location);
  const description = normalizeText(payload.description);
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

function validateRegistrationPayload(payload) {
  const eventId = parsePositiveInteger(payload.event_id);
  const fullName = normalizeText(payload.full_name);
  const studentId = normalizeStudentId(payload.student_id);
  const email = normalizeEmail(payload.email);
  const phone = normalizeText(payload.phone);

  if (!eventId) {
    return {
      isValid: false,
      message: "event_id is invalid"
    };
  }

  if (!fullName || !studentId || !email || !phone) {
    return {
      isValid: false,
      message: "event_id, full_name, student_id, email, phone are required"
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return {
      isValid: false,
      message: "email is invalid"
    };
  }

  return {
    isValid: true,
    data: {
      event_id: eventId,
      full_name: fullName,
      student_id: studentId,
      email,
      phone
    }
  };
}

async function findEventById(eventId) {
  const [rows] = await pool.query(
    `
      SELECT id, title, event_time, location, description, created_at, updated_at
      FROM events
      WHERE id = ?
      LIMIT 1
    `,
    [eventId]
  );

  return rows[0] || null;
}

async function findDuplicateRegistration({ event_id, student_id, email }) {
  const [rows] = await pool.query(
    `
      SELECT id, student_id, email
      FROM registrations
      WHERE event_id = ?
        AND (LOWER(student_id) = LOWER(?) OR LOWER(email) = LOWER(?))
      LIMIT 1
    `,
    [event_id, student_id, email]
  );

  if (!rows[0]) {
    return null;
  }

  const duplicatedByStudentId =
    String(rows[0].student_id).toLowerCase() === String(student_id).toLowerCase();

  return {
    ...rows[0],
    duplicatedBy: duplicatedByStudentId ? "student_id" : "email"
  };
}

async function findRegistrationsByEventId(eventId) {
  const [rows] = await pool.query(
    `
      SELECT id, event_id, full_name, student_id, email, phone, created_at
      FROM registrations
      WHERE event_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [eventId]
  );

  return rows;
}

function getDuplicateRegistrationMessage(duplicatedBy) {
  if (duplicatedBy === "email") {
    return "Sinh viên đã đăng ký sự kiện này bằng email này rồi.";
  }

  return "Sinh viên đã đăng ký sự kiện này bằng MSSV này rồi.";
}

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
      SELECT
        e.id,
        e.title,
        e.event_time,
        e.location,
        e.description,
        e.created_at,
        e.updated_at,
        (
          SELECT COUNT(*)
          FROM registrations r
          WHERE r.event_id = e.id
        ) AS registration_count
      FROM events e
      ORDER BY e.event_time ASC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch events",
      error: error.message
    });
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    const event = await findEventById(eventId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found"
      });
    }

    return res.json(event);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch event",
      error: error.message
    });
  }
});

app.get("/api/events/:id/registrations", async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    const event = await findEventById(eventId);

    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const registrations = await findRegistrationsByEventId(eventId);

    return res.json({
      event,
      totalRegistrations: registrations.length,
      registrations
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể tải danh sách người đăng ký",
      error: error.message
    });
  }
});

app.post("/api/events", async (req, res) => {
  try {
    const validation = validateEventPayload(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const { title, event_time, location, description } = validation.data;

    const [result] = await pool.query(
      `
      INSERT INTO events (title, event_time, location, description)
      VALUES (?, ?, ?, ?)
      `,
      [title, event_time, location, description]
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

app.put("/api/events/:id", async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);

    if (!eventId) {
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

app.post("/api/registrations", async (req, res) => {
  try {
    const validation = validateRegistrationPayload(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const registrationData = validation.data;
    const event = await findEventById(registrationData.event_id);

    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const duplicateRegistration = await findDuplicateRegistration(registrationData);

    if (duplicateRegistration) {
      return res.status(409).json({
        message: getDuplicateRegistrationMessage(duplicateRegistration.duplicatedBy),
        code: "DUPLICATE_REGISTRATION",
        duplicatedBy: duplicateRegistration.duplicatedBy
      });
    }

    const [result] = await pool.query(
      `
        INSERT INTO registrations (event_id, full_name, student_id, email, phone)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        registrationData.event_id,
        registrationData.full_name,
        registrationData.student_id,
        registrationData.email,
        registrationData.phone
      ]
    );

    return res.status(201).json({
      message: "Đăng ký tham gia sự kiện thành công.",
      registrationId: result.insertId,
      eventId: registrationData.event_id
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const duplicatedBy = error.message.includes("uq_event_email") ? "email" : "student_id";

      return res.status(409).json({
        message: getDuplicateRegistrationMessage(duplicatedBy),
        code: "DUPLICATE_REGISTRATION",
        duplicatedBy
      });
    }

    return res.status(500).json({
      message: "Không thể đăng ký sự kiện",
      error: error.message
    });
  }
});

app.use(express.static(frontendDir));

app.get("/", (req, res) => {
  res.redirect("/TaoSuKien.html");
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}/TaoSuKien.html`);
  });
}

module.exports = app;
