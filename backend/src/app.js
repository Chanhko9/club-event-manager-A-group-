const path = require("node:path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const ExcelJS = require("exceljs");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pool = require("./config/db");
const {
  EMAIL_STATUS,
  buildQrPayload: buildEmailQrPayload,
  sendConfirmationEmail,
  sendFeedbackInvitationEmail,
  createMailerTransport
} = require("./services/confirmationEmailService");
const {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminSessionConfig,
  createAdminSessionToken,
  verifyAdminSessionToken,
  authenticateAdmin,
  getSessionTokenFromRequest,
  ensureAdminAuthInfrastructure
} = require("./services/adminAuthService");

const app = express();
const PORT = process.env.PORT || 5000;
const frontendDir = path.resolve(__dirname, "../../frontend");
const EMAIL_SEND_TYPES = Object.freeze({
  INITIAL: "initial",
  RESEND: "resend"
});

function buildCookieOptions(maxAgeMs = 0) {
  return [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    maxAgeMs > 0 ? `Max-Age=${Math.floor(maxAgeMs / 1000)}` : "Max-Age=0"
  ].join("; ");
}

function setAdminSessionCookie(res, sessionToken) {
  const { sessionTtlHours } = getAdminSessionConfig();
  const maxAgeMs = sessionTtlHours * 60 * 60 * 1000;
  res.setHeader(
    "Set-Cookie",
    buildCookieOptions(maxAgeMs).replace(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
      `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`
    )
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", buildCookieOptions(0));
}

async function attachAdminSession(req, res, next) {
  try {
    const token = getSessionTokenFromRequest(req);
    const verificationResult = await verifyAdminSessionToken(token);

    req.adminSession = verificationResult.isValid
      ? {
          isAuthenticated: true,
          ...verificationResult.session
        }
      : {
          isAuthenticated: false
        };

    next();
  } catch (error) {
    req.adminSession = {
      isAuthenticated: false
    };
    next();
  }
}

function requireAdminApiAuth(req, res, next) {
  if (req.adminSession?.isAuthenticated) {
    return next();
  }

  return res.status(401).json({
    message: "Vui lòng đăng nhập bằng tài khoản admin để sử dụng chức năng quản trị.",
    code: "ADMIN_AUTH_REQUIRED"
  });
}

function requireAdminPageAuth(req, res, next) {
  if (req.adminSession?.isAuthenticated) {
    return next();
  }

  const redirectPath = encodeURIComponent(req.originalUrl || "/TaoSuKien.html");
  return res.redirect(`/LoginAdmin.html?redirect=${redirectPath}`);
}

app.use(attachAdminSession);

app.use(cors({ origin: true, credentials: true }));
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

function normalizeOptionalField(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || null;
}

function resolveRegistrationCourseGroup(registration) {
  const className = normalizeText(registration?.class_name);
  if (className) {
    return className;
  }

  const faculty = normalizeText(registration?.faculty);
  if (faculty) {
    return faculty;
  }

  return "Chưa cập nhật";
}

function buildEventReportSummary(registrations) {
  const safeRegistrations = Array.isArray(registrations) ? registrations : [];
  const courseMap = new Map();

  safeRegistrations.forEach((registration) => {
    const courseName = resolveRegistrationCourseGroup(registration);
    const currentValue = courseMap.get(courseName) || {
      course_name: courseName,
      registration_count: 0,
      checkin_count: 0
    };

    currentValue.registration_count += 1;
    if (registration?.checked_in_at) {
      currentValue.checkin_count += 1;
    }

    courseMap.set(courseName, currentValue);
  });

  const courseStatistics = Array.from(courseMap.values()).sort((left, right) => {
    if (right.registration_count !== left.registration_count) {
      return right.registration_count - left.registration_count;
    }

    return left.course_name.localeCompare(right.course_name, "vi");
  });

  return {
    total_registrations: safeRegistrations.length,
    total_checkins: safeRegistrations.filter((registration) => Boolean(registration?.checked_in_at))
      .length,
    course_statistics: courseStatistics
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
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

function parseScannedQrContent(value) {
  const normalizedValue = normalizeText(value);
  const parsedContent = {
    raw: normalizedValue,
    registrationId: null,
    eventId: null
  };

  if (!normalizedValue) {
    return parsedContent;
  }

  if (/^DK-(\d+)$/i.test(normalizedValue)) {
    parsedContent.registrationId = parsePositiveInteger(
      normalizedValue.replace(/^DK-/i, "")
    );
    return parsedContent;
  }

  if (normalizedValue.startsWith("{")) {
    try {
      const payload = JSON.parse(normalizedValue);
      parsedContent.registrationId = parsePositiveInteger(payload?.registrationId);
      parsedContent.eventId = parsePositiveInteger(payload?.eventId);
      if (parsedContent.registrationId || parsedContent.eventId) {
        return parsedContent;
      }
    } catch (error) {
      // Ignore malformed JSON and continue with text-based parsing.
    }
  }

  const registrationIdMatch = normalizedValue.match(/Ma\s*dang\s*ky\s*:\s*(\d+)/i);
  const eventIdMatch = normalizedValue.match(/Ma\s*su\s*kien\s*:\s*(\d+)/i);

  if (registrationIdMatch) {
    parsedContent.registrationId = parsePositiveInteger(registrationIdMatch[1]);
  }

  if (eventIdMatch) {
    parsedContent.eventId = parsePositiveInteger(eventIdMatch[1]);
  }

  return parsedContent;
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

function normalizeFrontendRedirectPath(value) {
  const rawValue = normalizeText(value);
  if (!rawValue) {
    return "";
  }

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsedUrl = new URL(rawValue);
      return `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`;
    } catch (error) {
      return "";
    }
  }

  if (rawValue.startsWith("javascript:") || rawValue.startsWith("//")) {
    return "";
  }

  if (rawValue.startsWith("./")) {
    return `/${rawValue.slice(2)}`;
  }

  return rawValue.startsWith("/") ? rawValue : `/${rawValue}`;
}

function resolvePublicBaseUrl(req) {
  const configuredBaseUrl = normalizeBaseUrl(
    process.env.PUBLIC_APP_BASE_URL || process.env.FRONTEND_PUBLIC_URL
  );
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const host = normalizeText(req.get("host"));
  if (!host) {
    return "http://localhost:5000";
  }

  return `${req.protocol}://${host}`;
}

function buildFeedbackFormUrl(req, eventId) {
  const publicBaseUrl = resolvePublicBaseUrl(req);
  return `${publicBaseUrl}/FeedbackSuKien.html?eventId=${eventId}`;
}

function mapRegistrationForClient(registration) {
  return {
    ...registration,
    registration_code: buildRegistrationCode(registration.id),
    qr_code: registration.qr_code || buildRegistrationCode(registration.id),
    email_delivery_status: registration.email_delivery_status || EMAIL_STATUS.PENDING,
    email_sent_at: registration.email_sent_at || null,
    email_error_message: registration.email_error_message || null,
    is_checked_in: Boolean(registration.checked_in_at)
  };
}

function buildAlreadyCheckedInPayload(registration) {
  return {
    message: "Đã check-in",
    first_checked_in_at: registration?.checked_in_at || null,
    registration: registration ? mapRegistrationForClient(registration) : null
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
        class_name,
        faculty,
        email,
        phone,
        qr_code,
        qr_payload,
        qr_created_at,
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
        class_name,
        faculty,
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
    params = [
      eventId,
      Number.parseInt(registrationCodeMatch[1], 10),
      normalizedEmail,
      normalizedStudentId
    ];
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
  const className = normalizeOptionalField(payload.class_name);
  const faculty = normalizeOptionalField(payload.faculty);

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

  if (!isValidEmail(email)) {
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
      phone,
      class_name: className,
      faculty
    }
  };
}

function validateFeedbackFormPayload(payload) {
  const satisfactionQuestion =
    normalizeText(payload.satisfaction_question) ||
    "Mức độ hài lòng của bạn về sự kiện là gì?";
  const commentQuestion =
    normalizeText(payload.comment_question) ||
    "Bạn có góp ý gì để sự kiện sau tốt hơn không?";
  const successMessage =
    normalizeText(payload.success_message) ||
    "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.";
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

  if (!isValidEmail(email)) {
    return {
      isValid: false,
      message: "email is invalid"
    };
  }

  if (
    !Number.isInteger(satisfactionRating) ||
    satisfactionRating < 1 ||
    satisfactionRating > 5
  ) {
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
  return (
    String(value ?? "su-kien")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "su-kien"
  );
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

async function ensureTableColumn(tableName, columnName, definition) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
  if (Array.isArray(rows) && rows.length > 0) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function ensureRegistrationEmailInfrastructure() {
  await ensureTableColumn("registrations", "qr_code", "VARCHAR(50) NULL AFTER phone");
  await ensureTableColumn("registrations", "qr_payload", "LONGTEXT NULL AFTER qr_code");
  await ensureTableColumn("registrations", "qr_created_at", "DATETIME NULL AFTER qr_payload");
  await ensureTableColumn(
    "registrations",
    "email_delivery_status",
    `VARCHAR(30) NOT NULL DEFAULT '${EMAIL_STATUS.PENDING}' AFTER qr_created_at`
  );
  await ensureTableColumn(
    "registrations",
    "email_sent_at",
    "DATETIME NULL AFTER email_delivery_status"
  );
  await ensureTableColumn(
    "registrations",
    "email_error_message",
    "TEXT NULL AFTER email_sent_at"
  );
  await ensureTableColumn(
    "registrations",
    "class_name",
    "VARCHAR(100) NULL AFTER student_id"
  );
  await ensureTableColumn(
    "registrations",
    "faculty",
    "VARCHAR(150) NULL AFTER class_name"
  );
  await ensureTableColumn(
    "registrations",
    "checked_in_at",
    "DATETIME NULL AFTER email_error_message"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registration_email_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      registration_id INT NOT NULL,
      event_id INT NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      send_type VARCHAR(20) NOT NULL DEFAULT 'initial',
      delivery_status VARCHAR(30) NOT NULL,
      message_id VARCHAR(255) NULL,
      error_message TEXT NULL,
      qr_payload LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_registration_email_logs_registration
        FOREIGN KEY (registration_id) REFERENCES registrations(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_registration_email_logs_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE
    )
  `);

  await ensureTableColumn(
    "registration_email_logs",
    "recipient_email",
    "VARCHAR(255) NOT NULL DEFAULT '' AFTER event_id"
  );
  await ensureTableColumn(
    "registration_email_logs",
    "send_type",
    "VARCHAR(20) NOT NULL DEFAULT 'initial' AFTER recipient_email"
  );
  await ensureTableColumn(
    "registration_email_logs",
    "delivery_status",
    `VARCHAR(30) NOT NULL DEFAULT '${EMAIL_STATUS.PENDING}' AFTER send_type`
  );
  await ensureTableColumn(
    "registration_email_logs",
    "message_id",
    "VARCHAR(255) NULL AFTER delivery_status"
  );
  await ensureTableColumn(
    "registration_email_logs",
    "error_message",
    "TEXT NULL AFTER message_id"
  );
  await ensureTableColumn(
    "registration_email_logs",
    "qr_payload",
    "LONGTEXT NULL AFTER error_message"
  );
  await ensureTableColumn(
    "registration_email_logs",
    "created_at",
    "TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER qr_payload"
  );
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
        class_name,
        faculty,
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
        class_name,
        faculty,
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
        class_name,
        faculty,
        email,
        phone,
        qr_code,
        qr_payload,
        qr_created_at,
        email_delivery_status,
        email_sent_at,
        email_error_message,
        checked_in_at,
        created_at
      FROM registrations
      WHERE id = ?
      LIMIT 1
    `,
    [registrationId]
  );

  return rows[0] || null;
}

async function findRegistrationForQrScan(qrContent) {
  const parsedQrContent = parseScannedQrContent(qrContent);

  if (!parsedQrContent.registrationId) {
    return {
      registration: null,
      parsedQrContent
    };
  }

  const registration = await findRegistrationById(parsedQrContent.registrationId);

  return {
    registration,
    parsedQrContent
  };
}

async function markRegistrationAsCheckedIn(eventId, registrationId) {
  const [result] = await pool.query(
    `
      UPDATE registrations
      SET checked_in_at = NOW()
      WHERE event_id = ? AND id = ? AND checked_in_at IS NULL
    `,
    [eventId, registrationId]
  );

  const registration = await findRegistrationByIdForEvent(eventId, registrationId);

  return {
    didUpdate: Number(result?.affectedRows || 0) > 0,
    registration
  };
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

function isLegacyQrPayload(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue || !normalizedValue.startsWith("{")) {
    return false;
  }

  try {
    const parsedValue = JSON.parse(normalizedValue);
    return Boolean(
      parsedValue &&
        typeof parsedValue === "object" &&
        parsedValue.registrationId &&
        parsedValue.eventId
    );
  } catch (error) {
    return false;
  }
}

function resolveRegistrationQrPayload({ event, registration }) {
  const storedPayload = normalizeText(registration.qr_payload);
  if (storedPayload && !isLegacyQrPayload(storedPayload)) {
    return storedPayload;
  }

  return buildEmailQrPayload({ event, registration });
}

async function persistRegistrationQrPayload(registrationId, qrPayload) {
  await pool.query(
    `
      UPDATE registrations
      SET qr_code = ?,
          qr_payload = ?,
          qr_created_at = NOW()
      WHERE id = ?
    `,
    [buildRegistrationCode(registrationId), qrPayload, registrationId]
  );
}

async function createRegistrationEmailLog({
  registrationId,
  eventId,
  recipientEmail,
  sendType,
  deliveryStatus,
  messageId = null,
  errorMessage = null,
  qrPayload = null
}) {
  const [result] = await pool.query(
    `
      INSERT INTO registration_email_logs (
        registration_id,
        event_id,
        recipient_email,
        send_type,
        delivery_status,
        message_id,
        error_message,
        qr_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      registrationId,
      eventId,
      recipientEmail,
      sendType,
      deliveryStatus,
      messageId,
      errorMessage,
      qrPayload
    ]
  );

  return {
    id: result?.insertId || null,
    registration_id: registrationId,
    event_id: eventId,
    recipient_email: recipientEmail,
    send_type: sendType,
    delivery_status: deliveryStatus,
    message_id: messageId,
    error_message: errorMessage,
    qr_payload: qrPayload
  };
}

function buildDeliveryMetadataWarningMessage(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return null;
  }

  return warnings.join(" ");
}

async function tryUpdateRegistrationEmailStatus(
  registrationId,
  status,
  errorMessage,
  warnings
) {
  try {
    await updateRegistrationEmailStatus(registrationId, status, errorMessage);
  } catch (error) {
    warnings.push(`Không thể cập nhật trạng thái email: ${error.message}`);
  }
}

async function tryCreateRegistrationEmailLog(logPayload, warnings) {
  try {
    return await createRegistrationEmailLog(logPayload);
  } catch (error) {
    warnings.push(`Không thể lưu lịch sử gửi email: ${error.message}`);
    return null;
  }
}

async function deliverRegistrationConfirmationEmail({
  event,
  registration,
  sendType = EMAIL_SEND_TYPES.INITIAL,
  transporter
}) {
  const recipientEmail = normalizeEmail(registration.email);
  const qrPayload = resolveRegistrationQrPayload({ event, registration });
  const warnings = [];

  await persistRegistrationQrPayload(registration.id, qrPayload);

  if (!isValidEmail(recipientEmail)) {
    const error = new Error("Email người đăng ký không hợp lệ.");
    error.statusCode = 400;

    await tryUpdateRegistrationEmailStatus(
      registration.id,
      EMAIL_STATUS.FAILED,
      error.message,
      warnings
    );
    error.emailLog = await tryCreateRegistrationEmailLog(
      {
        registrationId: registration.id,
        eventId: event.id,
        recipientEmail: recipientEmail || normalizeText(registration.email),
        sendType,
        deliveryStatus: EMAIL_STATUS.FAILED,
        errorMessage: error.message,
        qrPayload
      },
      warnings
    );
    error.deliveryWarnings = warnings;

    throw error;
  }

  let emailResult;

  try {
    emailResult = await sendConfirmationEmail({
      event,
      registration: {
        ...registration,
        email: recipientEmail
      },
      qrPayload,
      transporter
    });
  } catch (emailError) {
    await tryUpdateRegistrationEmailStatus(
      registration.id,
      EMAIL_STATUS.FAILED,
      emailError.message,
      warnings
    );
    emailError.emailLog = await tryCreateRegistrationEmailLog(
      {
        registrationId: registration.id,
        eventId: event.id,
        recipientEmail,
        sendType,
        deliveryStatus: EMAIL_STATUS.FAILED,
        errorMessage: emailError.message,
        qrPayload
      },
      warnings
    );
    emailError.deliveryWarnings = warnings;
    emailError.statusCode = emailError.statusCode || 502;
    throw emailError;
  }

  await tryUpdateRegistrationEmailStatus(
    registration.id,
    EMAIL_STATUS.SENT,
    null,
    warnings
  );
  const emailLog = await tryCreateRegistrationEmailLog(
    {
      registrationId: registration.id,
      eventId: event.id,
      recipientEmail,
      sendType,
      deliveryStatus: EMAIL_STATUS.SENT,
      messageId: emailResult.messageId,
      qrPayload: emailResult.qrPayload
    },
    warnings
  );

  return {
    emailResult,
    emailLog,
    qrPayload: emailResult.qrPayload,
    warningMessage: buildDeliveryMetadataWarningMessage(warnings),
    warnings
  };
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
    {
      header: "Trạng thái email",
      key: "email_delivery_status",
      minWidth: 18,
      maxWidth: 24
    },
    {
      header: "Trạng thái check-in",
      key: "check_in_status",
      minWidth: 18,
      maxWidth: 24
    },
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

app.post("/api/admin/login", async (req, res) => {
  try {
    const identifier = normalizeText(req.body?.identifier);
    const password = normalizeText(req.body?.password);
    const redirectTo =
      normalizeFrontendRedirectPath(req.body?.redirect) || "/TaoSuKien.html";

    if (!identifier || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập tên đăng nhập/email và mật khẩu."
      });
    }

    const admin = await authenticateAdmin({ identifier, password });
    if (!admin) {
      return res.status(401).json({
        message: "Thông tin đăng nhập admin không đúng."
      });
    }

    const sessionToken = createAdminSessionToken(admin);
    setAdminSessionCookie(res, sessionToken);

    return res.status(200).json({
      message: "Đăng nhập admin thành công.",
      admin,
      redirectTo
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể đăng nhập admin lúc này.",
      error: error.message
    });
  }
});

app.post("/api/admin/logout", (req, res) => {
  clearAdminSessionCookie(res);
  return res.status(200).json({
    message: "Đăng xuất admin thành công."
  });
});

app.get("/api/admin/session", (req, res) => {
  if (!req.adminSession?.isAuthenticated) {
    return res.status(401).json({
      message: "Chưa đăng nhập admin.",
      code: "ADMIN_NOT_AUTHENTICATED"
    });
  }

  return res.status(200).json({
    isAuthenticated: true,
    admin: {
      id: req.adminSession.id,
      username: req.adminSession.username,
      email: req.adminSession.email,
      full_name: req.adminSession.full_name,
      role: req.adminSession.role
    },
    expiresAt: req.adminSession.expiresAt
  });
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

app.get("/api/events/:id/report-summary", requireAdminApiAuth, async (req, res) => {
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

    const registrations = await getRegistrationsByEventId(eventId, { checkin: "all" });
    const summary = buildEventReportSummary(registrations);

    return res.json({
      event,
      summary
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể lấy báo cáo thống kê của sự kiện",
      error: error.message
    });
  }
});

app.get("/api/events/:id/registrations", requireAdminApiAuth, async (req, res) => {
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

    const totalRegistrations = await getRegistrationsByEventId(eventId, {
      checkin: "all"
    }).then((rows) => rows.length);

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

app.get("/api/events/:id/registrations/search", requireAdminApiAuth, async (req, res) => {
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

app.post(
  "/api/events/:eventId/registrations/:registrationId/resend-confirmation-email",
  requireAdminApiAuth,
  async (req, res) => {
    let registration = null;

    try {
      const eventId = parsePositiveInteger(req.params.eventId);
      const registrationId = parsePositiveInteger(req.params.registrationId);

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

      registration = await findRegistrationByIdForEvent(eventId, registrationId);
      if (!registration) {
        return res.status(404).json({
          message: "Không tìm thấy người đăng ký cho sự kiện này"
        });
      }

      const deliveryResult = await deliverRegistrationConfirmationEmail({
        event,
        registration,
        sendType: EMAIL_SEND_TYPES.RESEND
      });

      const latestRegistration = await findRegistrationByIdForEvent(eventId, registrationId);

      return res.json({
        message: "Đã gửi lại email xác nhận thành công.",
        warning: deliveryResult.warningMessage || null,
        registration: mapRegistrationForClient(latestRegistration || registration),
        emailLog: deliveryResult.emailLog,
        qrPayload: deliveryResult.qrPayload
      });
    } catch (error) {
      const eventId = parsePositiveInteger(req.params.eventId);
      const registrationId = parsePositiveInteger(req.params.registrationId);
      const latestRegistration =
        eventId && registrationId
          ? await findRegistrationByIdForEvent(eventId, registrationId).catch(() => null)
          : null;

      return res.status(error.statusCode || 502).json({
        message:
          error.statusCode === 400
            ? error.message
            : "Gửi lại email xác nhận thất bại.",
        error: error.message,
        warnings: Array.isArray(error.deliveryWarnings) ? error.deliveryWarnings : [],
        registration: latestRegistration
          ? mapRegistrationForClient(latestRegistration)
          : registration
            ? mapRegistrationForClient(registration)
            : null,
        emailLog: error.emailLog || null
      });
    }
  }
);

app.post("/api/events/:id/check-in/qr", requireAdminApiAuth, async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);
    const qrContent = normalizeText(
      req.body?.qr_content || req.body?.qrContent || req.body?.value
    );

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    if (!qrContent) {
      return res.status(400).json({
        message: "Vui lòng cung cấp nội dung QR để check-in."
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const { registration, parsedQrContent } = await findRegistrationForQrScan(qrContent);

    if (!registration) {
      return res.status(404).json({
        message: "QR không hợp lệ hoặc không tồn tại trong hệ thống.",
        qrContent
      });
    }

    if (
      parsedQrContent.eventId &&
      Number(parsedQrContent.eventId) !== Number(registration.event_id)
    ) {
      return res.status(400).json({
        message: "QR không hợp lệ cho người tham gia này.",
        registration: mapRegistrationForClient(registration)
      });
    }

    if (Number(registration.event_id) !== Number(eventId)) {
      return res.status(409).json({
        message: "QR thuộc sự kiện khác, không thể check-in cho sự kiện hiện tại.",
        registration: mapRegistrationForClient(registration)
      });
    }

    if (registration.checked_in_at) {
      return res.status(409).json(buildAlreadyCheckedInPayload(registration));
    }

    const checkinResult = await markRegistrationAsCheckedIn(eventId, registration.id);

    if (!checkinResult.registration) {
      throw new Error("Không tìm thấy người đăng ký sau khi cập nhật check-in.");
    }

    if (!checkinResult.didUpdate && checkinResult.registration.checked_in_at) {
      return res.status(409).json(buildAlreadyCheckedInPayload(checkinResult.registration));
    }

    return res.json({
      message: "Quét QR thành công. Đã cập nhật trạng thái check-in.",
      event,
      registration: mapRegistrationForClient(checkinResult.registration)
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể check-in bằng QR",
      error: error.message
    });
  }
});

app.post("/api/events/:id/check-in/manual", requireAdminApiAuth, async (req, res) => {
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
      return res.status(409).json(buildAlreadyCheckedInPayload(registration));
    }

    const checkinResult = await markRegistrationAsCheckedIn(eventId, registrationId);

    if (!checkinResult.registration) {
      throw new Error("Không tìm thấy người đăng ký sau khi cập nhật check-in.");
    }

    if (!checkinResult.didUpdate && checkinResult.registration.checked_in_at) {
      return res.status(409).json(buildAlreadyCheckedInPayload(checkinResult.registration));
    }

    return res.json({
      message: "Check-in thủ công thành công.",
      registration: mapRegistrationForClient(checkinResult.registration)
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể check-in thủ công",
      error: error.message
    });
  }
});

app.get("/api/events/:id/registrations/export", requireAdminApiAuth, async (req, res) => {
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

app.post("/api/events", requireAdminApiAuth, async (req, res) => {
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

app.put("/api/events/:id", requireAdminApiAuth, async (req, res) => {
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

app.delete("/api/events/:id", requireAdminApiAuth, async (req, res) => {
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

app.get("/api/events/:id/feedback-form", requireAdminApiAuth, async (req, res) => {
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

app.put("/api/events/:id/feedback-form", requireAdminApiAuth, async (req, res) => {
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

app.post("/api/events/:id/send-feedback-links", requireAdminApiAuth, async (req, res) => {
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

    const feedbackForm = await findFeedbackFormByEventId(eventId);
    if (!feedbackForm || !Boolean(feedbackForm.is_enabled)) {
      return res.status(409).json({
        message: "Vui lòng mở form feedback trước khi gửi link cho người tham gia."
      });
    }

    const registrations = await getRegistrationsByEventId(eventId, { checkin: "all" });
    if (!registrations.length) {
      return res.status(404).json({
        message: "Sự kiện chưa có người đăng ký để gửi link feedback."
      });
    }

    const feedbackUrl = buildFeedbackFormUrl(req, eventId);
    const transporter = createMailerTransport();

    const deliveryResults = await Promise.allSettled(
      registrations.map((registration) =>
        sendFeedbackInvitationEmail({
          event,
          registration,
          feedbackUrl,
          transporter
        })
      )
    );

    const sent = [];
    const failed = [];

    deliveryResults.forEach((result, index) => {
      const registration = registrations[index];

      if (result.status === "fulfilled") {
        sent.push({
          registration_id: registration.id,
          full_name: registration.full_name,
          email: registration.email,
          message_id: result.value?.messageId || null
        });
        return;
      }

      failed.push({
        registration_id: registration.id,
        full_name: registration.full_name,
        email: registration.email,
        error: result.reason?.message || "Gửi email thất bại."
      });
    });

    const hasSent = sent.length > 0;
    const hasFailed = failed.length > 0;
    const statusCode = hasFailed && !hasSent ? 502 : 200;

    let message = `Đã gửi link feedback cho ${sent.length}/${registrations.length} người tham gia.`;
    if (hasFailed && hasSent) {
      message = `Đã gửi link feedback cho ${sent.length}/${registrations.length} người tham gia. ${failed.length} email gửi thất bại.`;
    } else if (hasFailed && !hasSent) {
      message = "Không thể gửi email feedback cho người tham gia nào.";
    }

    return res.status(statusCode).json({
      message,
      event,
      feedbackUrl,
      totalRecipients: registrations.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể gửi link feedback qua email",
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
      message:
        feedbackForm.success_message || "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.",
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
        INSERT INTO registrations (event_id, full_name, student_id, class_name, faculty, email, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        registrationData.event_id,
        registrationData.full_name,
        registrationData.student_id,
        registrationData.class_name,
        registrationData.faculty,
        registrationData.email,
        registrationData.phone
      ]
    );

    const createdRegistration = await findRegistrationById(result.insertId);
    let emailDeliveryStatus = EMAIL_STATUS.PENDING;
    let emailErrorMessage = null;
    let resolvedQrPayload = resolveRegistrationQrPayload({
      event,
      registration: createdRegistration
    });

    try {
      const emailDeliveryResult = await deliverRegistrationConfirmationEmail({
        event,
        registration: createdRegistration,
        sendType: EMAIL_SEND_TYPES.INITIAL
      });
      emailDeliveryStatus = EMAIL_STATUS.SENT;
      resolvedQrPayload = emailDeliveryResult.qrPayload;
    } catch (emailError) {
      emailDeliveryStatus = EMAIL_STATUS.FAILED;
      emailErrorMessage = emailError.message;
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
      qrCode: latestRegistration?.qr_code || buildRegistrationCode(result.insertId),
      qrPayload: latestRegistration?.qr_payload || resolvedQrPayload
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const duplicatedBy = error.message.includes("uq_event_email")
        ? "email"
        : "student_id";

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

app.get(["/", "/index.html", "/frontend", "/frontend/", "/frontend/index.html"], (req, res) => {
  res.sendFile(path.resolve(frontendDir, "index.html"));
});

app.get(["/LoginAdmin.html", "/frontend/LoginAdmin.html"], (req, res) => {
  if (req.adminSession?.isAuthenticated) {
    return res.redirect("/TaoSuKien.html");
  }

  return res.sendFile(path.resolve(frontendDir, "LoginAdmin.html"));
});

app.get(["/TaoSuKien.html", "/frontend/TaoSuKien.html"], requireAdminPageAuth, (req, res) => {
  res.sendFile(path.resolve(frontendDir, "TaoSuKien.html"));
});

app.get(
  ["/DanhSachDangKy.html", "/frontend/DanhSachDangKy.html"],
  requireAdminPageAuth,
  (req, res) => {
    res.sendFile(path.resolve(frontendDir, "DanhSachDangKy.html"));
  }
);

app.use("/frontend", express.static(frontendDir));
app.use(express.static(frontendDir));

const appReady = Promise.all([
  ensureRegistrationEmailInfrastructure(),
  ensureFeedbackTables(),
  ensureAdminAuthInfrastructure()
]).catch((error) => {
  console.error("Không thể khởi tạo hạ tầng ứng dụng:", error.message);
  throw error;
});

if (require.main === module) {
  appReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
        console.log(`Frontend: http://localhost:${PORT}/`);
      });
    })
    .catch((error) => {
      console.error("Khởi động server thất bại:", error.message);
      process.exit(1);
    });
}

module.exports = app;
module.exports.appReady = appReady;