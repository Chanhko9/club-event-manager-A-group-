const path = require("node:path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const ExcelJS = require("exceljs");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pool = require("./config/db");
const { EMAIL_STATUS, sendConfirmationEmail } = require("./services/confirmationEmailService");

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

function buildRegistrationCode(registrationId) {
  return `DK-${String(registrationId).padStart(4, "0")}`;
}

function buildQrPayload({ registrationId, eventId, studentId, email }) {
  return JSON.stringify({
    registrationId,
    eventId,
    studentId,
    email
  });
}

function normalizeManualCheckinKeyword(value) {
  return normalizeText(value);
}

function mapRegistrationForClient(registration) {
  return {
    ...registration,
    registration_code: buildRegistrationCode(registration.id),
    is_checked_in: Boolean(registration.checked_in_at)
  };
}

async function findRegistrationByIdForEvent(eventId, registrationId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        event_id,
        full_name,
        student_id,
        email,
        phone,
        checked_in_at,
        CASE
          WHEN checked_in_at IS NULL THEN 'Chưa check-in'
          ELSE 'Đã check-in'
        END AS check_in_status,
        created_at
      FROM registrations
      WHERE event_id = ? AND id = ?
      LIMIT 1
    `,
    [eventId, registrationId]
  );

  return rows[0] || null;
}

async function findRegistrationForManualCheckin(eventId, keyword) {
  const trimmedKeyword = normalizeManualCheckinKeyword(keyword);
  if (!trimmedKeyword) {
    return null;
  }

  const normalizedEmail = normalizeEmail(trimmedKeyword);
  const normalizedStudentId = normalizeStudentId(trimmedKeyword);
  const registrationCodeMatch = normalizedStudentId.match(/^DK-(\d+)$/i);

  let sql = `
    SELECT
      id,
      event_id,
      full_name,
      student_id,
      email,
      phone,
      checked_in_at,
      CASE
        WHEN checked_in_at IS NULL THEN 'Chưa check-in'
        ELSE 'Đã check-in'
      END AS check_in_status,
      created_at
    FROM registrations
    WHERE event_id = ?
      AND (
        LOWER(email) = LOWER(?)
        OR UPPER(student_id) = UPPER(?)
      )
    ORDER BY id DESC
    LIMIT 1
  `;
  let params = [eventId, normalizedEmail, normalizedStudentId];

  if (registrationCodeMatch) {
    sql = `
      SELECT
        id,
        event_id,
        full_name,
        student_id,
        email,
        phone,
        checked_in_at,
        CASE
          WHEN checked_in_at IS NULL THEN 'Chưa check-in'
          ELSE 'Đã check-in'
        END AS check_in_status,
        created_at
      FROM registrations
      WHERE event_id = ?
        AND (
          id = ?
          OR LOWER(email) = LOWER(?)
          OR UPPER(student_id) = UPPER(?)
        )
      ORDER BY id DESC
      LIMIT 1
    `;
    params = [eventId, Number.parseInt(registrationCodeMatch[1], 10), normalizedEmail, normalizedStudentId];
  }

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
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


function validateFeedbackFormPayload(payload) {
  const satisfactionQuestion = normalizeText(payload.satisfaction_question) || "Mức độ hài lòng của bạn về sự kiện là gì?";
  const commentQuestion = normalizeText(payload.comment_question) || "Bạn có góp ý gì để sự kiện sau tốt hơn không?";
  const successMessage = normalizeText(payload.success_message) || "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.";
  const isEnabled = Boolean(payload.is_enabled);

  return {
    isValid: true,
    data: {
      satisfaction_question: satisfactionQuestion,
      comment_question: commentQuestion,
      success_message: successMessage,
      is_enabled: isEnabled ? 1 : 0
    }
  };
}

function validateFeedbackSubmissionPayload(payload) {
  const eventId = parsePositiveInteger(payload.event_id);
  const studentId = normalizeStudentId(payload.student_id);
  const email = normalizeEmail(payload.email);
  const comment = normalizeText(payload.comment);
  const satisfactionRating = Number.parseInt(payload.satisfaction_rating, 10);

  if (!eventId) {
    return {
      isValid: false,
      message: "event_id is invalid"
    };
  }

  if (!studentId || !email) {
    return {
      isValid: false,
      message: "student_id và email là bắt buộc để xác minh người tham gia."
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return {
      isValid: false,
      message: "email is invalid"
    };
  }

  if (!Number.isInteger(satisfactionRating) || satisfactionRating < 1 || satisfactionRating > 5) {
    return {
      isValid: false,
      message: "satisfaction_rating phải nằm trong khoảng từ 1 đến 5."
    };
  }

  return {
    isValid: true,
    data: {
      event_id: eventId,
      student_id: studentId,
      email,
      satisfaction_rating: satisfactionRating,
      comment: comment || null
    }
  };
}

function escapeFileName(value) {
  return String(value ?? "su-kien")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "su-kien";
}

function formatDateForFile(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
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

async function ensureFeedbackTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback_forms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL UNIQUE,
      satisfaction_question VARCHAR(255) NOT NULL DEFAULT 'Mức độ hài lòng của bạn về sự kiện là gì?',
      comment_question TEXT NOT NULL,
      success_message TEXT NOT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_feedback_forms_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback_responses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      feedback_form_id INT NOT NULL,
      event_id INT NOT NULL,
      registration_id INT NOT NULL,
      satisfaction_rating TINYINT NOT NULL,
      comment TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_feedback_responses_form
        FOREIGN KEY (feedback_form_id) REFERENCES feedback_forms(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_feedback_responses_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_feedback_responses_registration
        FOREIGN KEY (registration_id) REFERENCES registrations(id)
        ON DELETE CASCADE,
      CONSTRAINT uq_feedback_response UNIQUE (event_id, registration_id)
    )
  `);
}

function mapFeedbackFormForClient(form) {
  if (!form) {
    return {
      satisfaction_question: "Mức độ hài lòng của bạn về sự kiện là gì?",
      comment_question: "Bạn có góp ý gì để sự kiện sau tốt hơn không?",
      success_message: "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.",
      is_enabled: false,
      response_count: 0
    };
  }

  return {
    ...form,
    is_enabled: Boolean(form.is_enabled),
    response_count: Number(form.response_count || 0)
  };
}

async function findFeedbackFormByEventId(eventId) {
  const [rows] = await pool.query(
    `
      SELECT
        ff.id,
        ff.event_id,
        ff.satisfaction_question,
        ff.comment_question,
        ff.success_message,
        ff.is_enabled,
        ff.created_at,
        ff.updated_at,
        (
          SELECT COUNT(*)
          FROM feedback_responses fr
          WHERE fr.event_id = ff.event_id
        ) AS response_count
      FROM feedback_forms ff
      WHERE ff.event_id = ?
      LIMIT 1
    `,
    [eventId]
  );

  return rows[0] || null;
}

async function upsertFeedbackForm(eventId, payload) {
  const existingForm = await findFeedbackFormByEventId(eventId);

  if (existingForm) {
    await pool.query(
      `
        UPDATE feedback_forms
        SET satisfaction_question = ?,
            comment_question = ?,
            success_message = ?,
            is_enabled = ?
        WHERE event_id = ?
      `,
      [
        payload.satisfaction_question,
        payload.comment_question,
        payload.success_message,
        payload.is_enabled,
        eventId
      ]
    );
  } else {
    await pool.query(
      `
        INSERT INTO feedback_forms (
          event_id,
          satisfaction_question,
          comment_question,
          success_message,
          is_enabled
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        eventId,
        payload.satisfaction_question,
        payload.comment_question,
        payload.success_message,
        payload.is_enabled
      ]
    );
  }

  return findFeedbackFormByEventId(eventId);
}

async function findFeedbackParticipant(eventId, studentId, email) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        event_id,
        full_name,
        student_id,
        email,
        phone,
        checked_in_at,
        created_at
      FROM registrations
      WHERE event_id = ?
        AND UPPER(student_id) = UPPER(?)
        AND LOWER(email) = LOWER(?)
      ORDER BY id DESC
      LIMIT 1
    `,
    [eventId, studentId, email]
  );

  return rows[0] || null;
}

async function findFeedbackResponse(eventId, registrationId) {
  const [rows] = await pool.query(
    `
      SELECT
        fr.id,
        fr.feedback_form_id,
        fr.event_id,
        fr.registration_id,
        fr.satisfaction_rating,
        fr.comment,
        fr.created_at
      FROM feedback_responses fr
      WHERE fr.event_id = ? AND fr.registration_id = ?
      LIMIT 1
    `,
    [eventId, registrationId]
  );

  return rows[0] || null;
}

async function getFeedbackResponsesByEventId(eventId) {
  const [rows] = await pool.query(
    `
      SELECT
        fr.id,
        fr.feedback_form_id,
        fr.event_id,
        fr.registration_id,
        fr.satisfaction_rating,
        fr.comment,
        fr.created_at,
        r.full_name,
        r.student_id,
        r.email
      FROM feedback_responses fr
      INNER JOIN registrations r ON r.id = fr.registration_id
      WHERE fr.event_id = ?
      ORDER BY fr.created_at DESC, fr.id DESC
    `,
    [eventId]
  );

  return rows;
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

async function getRegistrationsByEventId(eventId, options = {}) {
  const { q, checkin } = options;
  const normalizedQuery = normalizeText(q).toLowerCase();

  const whereClauses = ["event_id = ?"];
  const queryParams = [eventId];

  if (checkin === "checked_in") {
    whereClauses.push("checked_in_at IS NOT NULL");
  } else if (checkin === "not_checked_in") {
    whereClauses.push("checked_in_at IS NULL");
  }

  if (normalizedQuery) {
    whereClauses.push(
      `(LOWER(full_name) LIKE ? OR LOWER(student_id) LIKE ? OR LOWER(email) LIKE ? OR LOWER(phone) LIKE ?)`
    );
    const likePattern = `%${normalizedQuery}%`;
    queryParams.push(likePattern, likePattern, likePattern, likePattern);
  }

  const [rows] = await pool.query(
    `
      SELECT
        id,
        event_id,
        full_name,
        student_id,
        email,
        phone,
        email_delivery_status,
        email_sent_at,
        email_error_message,
        checked_in_at,
        CASE
          WHEN checked_in_at IS NULL THEN 'Chưa check-in'
          ELSE 'Đã check-in'
        END AS check_in_status,
        created_at
      FROM registrations
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY created_at DESC, id DESC
    `,
    queryParams
  );

  return rows;
}

async function findRegistrationById(registrationId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        event_id,
        full_name,
        student_id,
        email,
        phone,
        qr_code,
        qr_payload,
        qr_created_at,
        email_delivery_status,
        email_sent_at,
        email_error_message,
        created_at
      FROM registrations
      WHERE id = ?
      LIMIT 1
    `,
    [registrationId]
  );

  return rows[0] || null;
}

async function updateRegistrationEmailStatus(registrationId, status, errorMessage = null) {
  const emailSentAt = status === EMAIL_STATUS.SENT ? new Date() : null;

  await pool.query(
    `
      UPDATE registrations
      SET email_delivery_status = ?,
          email_sent_at = ?,
          email_error_message = ?
      WHERE id = ?
    `,
    [status, emailSentAt, errorMessage, registrationId]
  );
}

function getDuplicateRegistrationMessage(duplicatedBy) {
  if (duplicatedBy === "email") {
    return "Sinh viên đã đăng ký sự kiện này bằng email này rồi.";
  }

  return "Sinh viên đã đăng ký sự kiện này bằng MSSV này rồi.";
}

async function buildRegistrationWorkbook(event, registrations) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Club Event Manager";
  workbook.lastModifiedBy = "Club Event Manager";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Danh sach dang ky", {
    views: [{ state: "frozen", ySplit: 6 }]
  });

  const headerRowIndex = 7;
  const widthPaddingPx = 20;
  const widthPaddingChars = Math.max(3, Math.ceil(widthPaddingPx / 7));
  const columns = [
    { header: "STT", key: "stt", minWidth: 8, maxWidth: 14 },
    { header: "Mã đăng ký", key: "registration_id", minWidth: 14, maxWidth: 22 },
    { header: "Họ tên", key: "full_name", minWidth: 22, maxWidth: 42 },
    { header: "MSSV", key: "student_id", minWidth: 14, maxWidth: 20 },
    { header: "Email", key: "email", minWidth: 24, maxWidth: 40 },
    { header: "Số điện thoại", key: "phone", minWidth: 16, maxWidth: 24 },
    { header: "Trạng thái email", key: "email_delivery_status", minWidth: 18, maxWidth: 24 },
    { header: "Trạng thái check-in", key: "check_in_status", minWidth: 18, maxWidth: 24 },
    { header: "Thời gian check-in", key: "checked_in_at", minWidth: 22, maxWidth: 28 },
    { header: "Thời gian đăng ký", key: "created_at", minWidth: 22, maxWidth: 28 }
  ];

  const formatDateTimeText = (value) => {
    if (!value) {
      return "";
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const getDisplayText = (value) => {
    if (value == null) {
      return "";
    }

    if (value instanceof Date) {
      return formatDateTimeText(value);
    }

    if (typeof value === "object") {
      if (Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text || "").join("");
      }

      if (typeof value.text === "string") {
        return value.text;
      }

      if (value.hyperlink && value.text) {
        return String(value.text);
      }

      if (value.result != null) {
        return String(value.result);
      }
    }

    return String(value);
  };

  const applyAutoWidths = (worksheet, columnConfig) => {
    columnConfig.forEach((column, index) => {
      const columnNumber = index + 1;
      let longest = column.minWidth;

      worksheet.eachRow({ includeEmpty: true }, (row) => {
        const cellText = getDisplayText(row.getCell(columnNumber).value);
        const lines = cellText.split(/\r?\n/);
        const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
        longest = Math.max(longest, longestLine + widthPaddingChars);
      });

      worksheet.getColumn(columnNumber).width = Math.min(longest, column.maxWidth);
    });
  };

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.minWidth
  }));

  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = `DANH SÁCH ĐĂNG KÝ - ${event.title}`;
  sheet.getCell("A1").font = { size: 16, bold: true };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  sheet.getCell("A2").value = "Mã sự kiện";
  sheet.getCell("B2").value = String(event.id ?? "");
  sheet.getCell("A3").value = "Thời gian sự kiện";
  sheet.getCell("B3").value = formatDateTimeText(event.event_time);
  sheet.getCell("A4").value = "Địa điểm";
  sheet.getCell("B4").value = event.location || "";
  sheet.getCell("A5").value = "Tổng số đăng ký";
  sheet.getCell("B5").value = String(registrations.length);

  for (const cell of ["A2", "A3", "A4", "A5"]) {
    sheet.getCell(cell).font = { bold: true };
  }

  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.values = columns.map((column) => column.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" }
  };
  headerRow.height = 22;

  registrations.forEach((registration, index) => {
    sheet.addRow({
      stt: index + 1,
      registration_id: registration.id,
      full_name: registration.full_name,
      student_id: registration.student_id,
      email: registration.email,
      phone: registration.phone || "",
      email_delivery_status: registration.email_delivery_status || EMAIL_STATUS.PENDING,
      check_in_status: registration.checked_in_at ? "Đã check-in" : "Chưa check-in",
      checked_in_at: formatDateTimeText(registration.checked_in_at),
      created_at: formatDateTimeText(registration.created_at)
    });
  });

  if (registrations.length === 0) {
    const emptyRow = sheet.addRow({
      stt: "",
      registration_id: "",
      full_name: "Chưa có người đăng ký",
      student_id: "",
      email: "",
      phone: "",
      email_delivery_status: "",
      check_in_status: "",
      checked_in_at: "",
      created_at: ""
    });
    emptyRow.font = { italic: true, color: { argb: "FF666666" } };
  }

  const firstTableRow = headerRowIndex;
  const lastTableRow = sheet.rowCount;

  for (let rowNumber = firstTableRow; rowNumber <= lastTableRow; rowNumber += 1) {
    for (let colNumber = 1; colNumber <= columns.length; colNumber += 1) {
      const cell = sheet.getRow(rowNumber).getCell(colNumber);
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E2F3" } },
        left: { style: "thin", color: { argb: "FFD9E2F3" } },
        bottom: { style: "thin", color: { argb: "FFD9E2F3" } },
        right: { style: "thin", color: { argb: "FFD9E2F3" } }
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: colNumber === 1 ? "center" : "left"
      };
    }
  }

  for (let rowNumber = headerRowIndex + 1; rowNumber <= lastTableRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FBFF" }
        };
      });
    }
  }

  applyAutoWidths(sheet, columns);

  const metadataColumnAValues = [
    "Mã sự kiện",
    "Thời gian sự kiện",
    "Địa điểm",
    "Tổng số đăng ký"
  ];
  const metadataColumnBValues = [
    String(event.id ?? ""),
    formatDateTimeText(event.event_time),
    String(event.location || ""),
    String(registrations.length)
  ];

  const metadataAWidth = metadataColumnAValues.reduce(
    (max, value) => Math.max(max, value.length + widthPaddingChars),
    sheet.getColumn(1).width || columns[0].minWidth
  );
  const metadataBWidth = metadataColumnBValues.reduce(
    (max, value) => Math.max(max, value.length + widthPaddingChars),
    sheet.getColumn(2).width || columns[1].minWidth
  );

  sheet.getColumn(1).width = Math.min(Math.max(metadataAWidth, 16), 28);
  sheet.getColumn(2).width = Math.min(Math.max(metadataBWidth, 24), 40);

  return workbook;
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

    const q = req.query.q || "";
    const checkin = req.query.checkin || "all";

    if (!["all", "checked_in", "not_checked_in"].includes(checkin)) {
      return res.status(400).json({
        message: "checkin filter không hợp lệ"
      });
    }

    const registrations = await getRegistrationsByEventId(eventId, {
      q,
      checkin
    });

    const totalRegistrations = await getRegistrationsByEventId(eventId, { checkin: "all" }).then((rows) => rows.length);

    return res.json({
      event,
      registrations: registrations.map(mapRegistrationForClient),
      totalRegistrations,
      total: registrations.length
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể lấy danh sách đăng ký",
      error: error.message
    });
  }
});

app.get("/api/events/:id/registrations/search", async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);
    const keyword = normalizeManualCheckinKeyword(req.query.keyword);

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    if (!keyword) {
      return res.status(400).json({
        message: "Vui lòng nhập mã đăng ký, email hoặc MSSV để tìm kiếm."
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const registration = await findRegistrationForManualCheckin(eventId, keyword);
    if (!registration) {
      return res.status(404).json({
        message: "Không thể tìm người đăng ký"
      });
    }

    return res.json({
      event,
      registration: mapRegistrationForClient(registration)
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể tìm người đăng ký",
      error: error.message
    });
  }
});

app.post("/api/events/:id/check-in/manual", async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);
    const registrationId = parsePositiveInteger(req.body?.registration_id);

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    if (!registrationId) {
      return res.status(400).json({
        message: "registration_id is invalid"
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const registration = await findRegistrationByIdForEvent(eventId, registrationId);
    if (!registration) {
      return res.status(404).json({
        message: "Không tìm thấy người đăng ký cho sự kiện này"
      });
    }

    if (registration.checked_in_at) {
      return res.status(409).json({
        message: "Người tham gia này đã được check-in trước đó.",
        registration: mapRegistrationForClient(registration)
      });
    }

    await pool.query(
      `
        UPDATE registrations
        SET checked_in_at = NOW()
        WHERE event_id = ? AND id = ? AND checked_in_at IS NULL
      `,
      [eventId, registrationId]
    );

    const updatedRegistration = await findRegistrationByIdForEvent(eventId, registrationId);

    return res.json({
      message: "Check-in thủ công thành công.",
      registration: mapRegistrationForClient(updatedRegistration)
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể check-in thủ công",
      error: error.message
    });
  }
});

app.get("/api/events/:id/registrations/export", async (req, res) => {
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

    const registrations = await getRegistrationsByEventId(eventId);
    const workbook = await buildRegistrationWorkbook(event, registrations);
    const safeTitle = escapeFileName(event.title);
    const fileName = `dang-ky-${safeTitle}-${formatDateForFile()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    return res.status(500).json({
      message: "Xuất file thất bại",
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

app.delete("/api/events/:id", async (req, res) => {
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

    const [result] = await pool.query(
      `
      DELETE FROM events
      WHERE id = ?
      `,
      [eventId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    res.json({
      message: "Xóa sự kiện thành công",
      eventId
    });
  } catch (error) {
    res.status(500).json({
      message: "Xóa sự kiện thất bại",
      error: error.message
    });
  }
});


app.get("/api/events/:id/feedback-form", async (req, res) => {
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

    let feedbackForm = await findFeedbackFormByEventId(eventId);
    if (!feedbackForm) {
      feedbackForm = await upsertFeedbackForm(eventId, {
        satisfaction_question: "Mức độ hài lòng của bạn về sự kiện là gì?",
        comment_question: "Bạn có góp ý gì để sự kiện sau tốt hơn không?",
        success_message: "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.",
        is_enabled: 0
      });
    }

    const feedbackResponses = await getFeedbackResponsesByEventId(eventId);

    return res.json({
      event,
      feedbackForm: mapFeedbackFormForClient(feedbackForm),
      feedbackResponses
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể tải cấu hình feedback",
      error: error.message
    });
  }
});

app.put("/api/events/:id/feedback-form", async (req, res) => {
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

    const validation = validateFeedbackFormPayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const feedbackForm = await upsertFeedbackForm(eventId, validation.data);

    return res.json({
      message: "Đã lưu cấu hình feedback cho sự kiện.",
      event,
      feedbackForm: mapFeedbackFormForClient(feedbackForm)
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể lưu cấu hình feedback",
      error: error.message
    });
  }
});

app.post("/api/events/:id/feedback-access", async (req, res) => {
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

    const form = await findFeedbackFormByEventId(eventId);
    if (!form || !Boolean(form.is_enabled)) {
      return res.status(403).json({
        message: "Form feedback cho sự kiện này hiện chưa mở."
      });
    }

    const studentId = normalizeStudentId(req.body?.student_id);
    const email = normalizeEmail(req.body?.email);

    if (!studentId || !email) {
      return res.status(400).json({
        message: "Vui lòng nhập MSSV và email đã dùng khi đăng ký sự kiện."
      });
    }

    const participant = await findFeedbackParticipant(eventId, studentId, email);
    if (!participant) {
      return res.status(403).json({
        message: "Bạn chỉ có thể gửi feedback cho sự kiện mà mình đã tham gia."
      });
    }

    const existingResponse = await findFeedbackResponse(eventId, participant.id);

    return res.json({
      event,
      participant: {
        id: participant.id,
        full_name: participant.full_name,
        student_id: participant.student_id,
        email: participant.email
      },
      feedbackForm: mapFeedbackFormForClient(form),
      hasSubmitted: Boolean(existingResponse),
      feedbackResponse: existingResponse
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể xác minh người tham gia",
      error: error.message
    });
  }
});

app.post("/api/events/:id/feedback-responses", async (req, res) => {
  try {
    const routeEventId = parsePositiveInteger(req.params.id);
    const validation = validateFeedbackSubmissionPayload({
      ...req.body,
      event_id: routeEventId
    });

    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const { event_id, student_id, email, satisfaction_rating, comment } = validation.data;
    const event = await findEventById(event_id);
    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const feedbackForm = await findFeedbackFormByEventId(event_id);
    if (!feedbackForm || !Boolean(feedbackForm.is_enabled)) {
      return res.status(403).json({
        message: "Form feedback cho sự kiện này hiện chưa mở."
      });
    }

    const participant = await findFeedbackParticipant(event_id, student_id, email);
    if (!participant) {
      return res.status(403).json({
        message: "Bạn chỉ có thể gửi feedback cho sự kiện mà mình đã tham gia."
      });
    }

    const existingResponse = await findFeedbackResponse(event_id, participant.id);
    if (existingResponse) {
      return res.status(409).json({
        message: "Bạn đã gửi feedback cho sự kiện này rồi.",
        feedbackResponse: existingResponse
      });
    }

    const [result] = await pool.query(
      `
        INSERT INTO feedback_responses (
          feedback_form_id,
          event_id,
          registration_id,
          satisfaction_rating,
          comment
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [feedbackForm.id, event_id, participant.id, satisfaction_rating, comment]
    );

    const savedResponse = await findFeedbackResponse(event_id, participant.id);

    return res.status(201).json({
      message: feedbackForm.success_message || "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.",
      event,
      participant: {
        id: participant.id,
        full_name: participant.full_name,
        student_id: participant.student_id,
        email: participant.email
      },
      feedbackResponse: savedResponse,
      responseId: result.insertId
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Bạn đã gửi feedback cho sự kiện này rồi."
      });
    }

    return res.status(500).json({
      message: "Không thể gửi feedback",
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

    const qrCode = buildRegistrationCode(result.insertId);

    const qrPayload = buildQrPayload({
      registrationId: result.insertId,
      eventId: registrationData.event_id,
      studentId: registrationData.student_id,
      email: registrationData.email
    });

    await pool.query(
      `
        UPDATE registrations
        SET qr_code = ?, qr_payload = ?, qr_created_at = NOW()
        WHERE id = ?
      `,
      [qrCode, qrPayload, result.insertId]
    );

    const createdRegistration = await findRegistrationById(result.insertId);
    let emailDeliveryStatus = EMAIL_STATUS.PENDING;
    let emailErrorMessage = null;

    try {
      await sendConfirmationEmail({
        event,
        registration: createdRegistration
      });
      emailDeliveryStatus = EMAIL_STATUS.SENT;
      await updateRegistrationEmailStatus(result.insertId, emailDeliveryStatus, null);
    } catch (emailError) {
      emailDeliveryStatus = EMAIL_STATUS.FAILED;
      emailErrorMessage = emailError.message;
      await updateRegistrationEmailStatus(result.insertId, emailDeliveryStatus, emailErrorMessage);
    }

    const latestRegistration = await findRegistrationById(result.insertId);

    return res.status(201).json({
      message:
        emailDeliveryStatus === EMAIL_STATUS.SENT
          ? "Đăng ký tham gia sự kiện thành công và đã gửi email xác nhận."
          : "Đăng ký tham gia sự kiện thành công nhưng gửi email xác nhận thất bại.",
      registrationId: result.insertId,
      eventId: registrationData.event_id,
      emailDeliveryStatus: latestRegistration?.email_delivery_status || emailDeliveryStatus,
      emailErrorMessage: latestRegistration?.email_error_message || emailErrorMessage,
      qrCode: latestRegistration?.qr_code || qrCode,
      qrPayload: latestRegistration?.qr_payload || qrPayload
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

const appReady = ensureFeedbackTables().catch((error) => {
  console.error("Không thể khởi tạo bảng feedback:", error.message);
  throw error;
});

if (require.main === module) {
  appReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
        console.log(`Frontend: http://localhost:${PORT}/TaoSuKien.html`);
      });
    })
    .catch((error) => {
      console.error("Khởi động server thất bại:", error.message);
      process.exit(1);
    });
}

module.exports = app;
module.exports.appReady = appReady;