const path = require("node:path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const ExcelJS = require("exceljs");

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

function parseRegistrationCode(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  const directInteger = parsePositiveInteger(normalizedValue);
  if (directInteger) {
    return directInteger;
  }

  const match = normalizedValue.match(/^DK[-\s_]*0*(\d+)$/i);
  if (!match) {
    return null;
  }

  return parsePositiveInteger(match[1]);
}

function formatRegistrationCode(registrationId) {
  return `DK-${String(registrationId).padStart(4, "0")}`;
}

function mapRegistrationRecord(row) {
  return {
    id: row.id,
    registration_code: formatRegistrationCode(row.id),
    event_id: row.event_id,
    full_name: row.full_name,
    student_id: row.student_id,
    email: row.email,
    phone: row.phone,
    created_at: row.created_at,
    checked_in_at: row.checked_in_at || null,
    check_in_method: row.check_in_method || null,
    is_checked_in: Boolean(row.checked_in_at)
  };
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

function validateManualCheckinSearchQuery(query) {
  const keyword = normalizeText(query);

  if (!keyword) {
    return {
      isValid: false,
      message: "Vui lòng nhập mã đăng ký, email hoặc MSSV để tìm kiếm."
    };
  }

  return {
    isValid: true,
    keyword
  };
}

function validateManualCheckinPayload(payload) {
  const registrationId = parsePositiveInteger(payload.registration_id);

  if (!registrationId) {
    return {
      isValid: false,
      message: "registration_id is invalid"
    };
  }

  return {
    isValid: true,
    registration_id: registrationId
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

async function getRegistrationsByEventId(eventId) {
  const [rows] = await pool.query(
    `
      SELECT
        r.id,
        r.event_id,
        r.full_name,
        r.student_id,
        r.email,
        r.phone,
        r.created_at,
        c.checked_in_at,
        c.check_in_method
      FROM registrations r
      LEFT JOIN checkins c ON c.registration_id = r.id
      WHERE r.event_id = ?
      ORDER BY r.created_at DESC, r.id DESC
    `,
    [eventId]
  );

  return rows.map(mapRegistrationRecord);
}

async function findRegistrationById(eventId, registrationId) {
  const [rows] = await pool.query(
    `
      SELECT
        r.id,
        r.event_id,
        r.full_name,
        r.student_id,
        r.email,
        r.phone,
        r.created_at,
        c.checked_in_at,
        c.check_in_method
      FROM registrations r
      LEFT JOIN checkins c ON c.registration_id = r.id
      WHERE r.event_id = ? AND r.id = ?
      LIMIT 1
    `,
    [eventId, registrationId]
  );

  return rows[0] ? mapRegistrationRecord(rows[0]) : null;
}

async function findRegistrationByLookup(eventId, rawKeyword) {
  const keyword = normalizeText(rawKeyword);
  const registrationId = parseRegistrationCode(keyword);
  const email = normalizeEmail(keyword);
  const studentId = normalizeStudentId(keyword);

  const conditions = [];
  const params = [eventId];

  if (registrationId) {
    conditions.push("r.id = ?");
    params.push(registrationId);
  }

  conditions.push("LOWER(r.email) = LOWER(?)");
  params.push(email);

  conditions.push("LOWER(r.student_id) = LOWER(?)");
  params.push(studentId);

  const [rows] = await pool.query(
    `
      SELECT
        r.id,
        r.event_id,
        r.full_name,
        r.student_id,
        r.email,
        r.phone,
        r.created_at,
        c.checked_in_at,
        c.check_in_method
      FROM registrations r
      LEFT JOIN checkins c ON c.registration_id = r.id
      WHERE r.event_id = ?
        AND (${conditions.join(" OR ")})
      ORDER BY r.id ASC
      LIMIT 1
    `,
    params
  );

  return rows[0] ? mapRegistrationRecord(rows[0]) : null;
}

async function createManualCheckin(eventId, registrationId) {
  const [result] = await pool.query(
    `
      INSERT INTO checkins (event_id, registration_id, check_in_method)
      VALUES (?, ?, 'manual')
    `,
    [eventId, registrationId]
  );

  return result.insertId;
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
    { header: "Mã đăng ký", key: "registration_code", minWidth: 14, maxWidth: 22 },
    { header: "Họ tên", key: "full_name", minWidth: 22, maxWidth: 42 },
    { header: "MSSV", key: "student_id", minWidth: 14, maxWidth: 20 },
    { header: "Email", key: "email", minWidth: 24, maxWidth: 40 },
    { header: "Số điện thoại", key: "phone", minWidth: 16, maxWidth: 24 },
    { header: "Thời gian đăng ký", key: "created_at", minWidth: 22, maxWidth: 28 },
    { header: "Trạng thái check-in", key: "checkin_status", minWidth: 18, maxWidth: 24 },
    { header: "Thời gian check-in", key: "checked_in_at", minWidth: 22, maxWidth: 28 }
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

  sheet.mergeCells("A1:I1");
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
      registration_code: registration.registration_code,
      full_name: registration.full_name,
      student_id: registration.student_id,
      email: registration.email,
      phone: registration.phone || "",
      created_at: formatDateTimeText(registration.created_at),
      checkin_status: registration.is_checked_in ? "Đã check-in" : "Chưa check-in",
      checked_in_at: formatDateTimeText(registration.checked_in_at)
    });
  });

  if (registrations.length === 0) {
    const emptyRow = sheet.addRow({
      stt: "",
      registration_code: "",
      full_name: "Chưa có người đăng ký",
      student_id: "",
      email: "",
      phone: "",
      created_at: "",
      checkin_status: "",
      checked_in_at: ""
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
        ) AS registration_count,
        (
          SELECT COUNT(*)
          FROM checkins c
          WHERE c.event_id = e.id
        ) AS check_in_count
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

    const registrations = await getRegistrationsByEventId(eventId);
    const totalCheckIns = registrations.filter((item) => item.is_checked_in).length;

    return res.json({
      event,
      registrations,
      totalRegistrations: registrations.length,
      totalCheckIns,
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

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    const validation = validateManualCheckinSearchQuery(req.query.keyword);
    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const registration = await findRegistrationByLookup(eventId, validation.keyword);
    if (!registration) {
      return res.status(404).json({
        message: "Không tìm thấy người đăng ký phù hợp với thông tin đã nhập."
      });
    }

    return res.json({
      event,
      registration
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể tìm người đăng ký",
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
      registrationCode: formatRegistrationCode(result.insertId),
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

app.post("/api/events/:id/check-in/manual", async (req, res) => {
  try {
    const eventId = parsePositiveInteger(req.params.id);

    if (!eventId) {
      return res.status(400).json({
        message: "Event id is invalid"
      });
    }

    const validation = validateManualCheckinPayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.message
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        message: "Sự kiện không tồn tại"
      });
    }

    const registration = await findRegistrationById(eventId, validation.registration_id);
    if (!registration) {
      return res.status(404).json({
        message: "Không tìm thấy người đăng ký thuộc sự kiện đã chọn."
      });
    }

    if (registration.is_checked_in) {
      return res.status(409).json({
        message: "Đã check-in",
        code: "ALREADY_CHECKED_IN",
        registration
      });
    }

    try {
      await createManualCheckin(eventId, registration.id);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        const currentRegistration = await findRegistrationById(eventId, registration.id);
        return res.status(409).json({
          message: "Đã check-in",
          code: "ALREADY_CHECKED_IN",
          registration: currentRegistration
        });
      }

      throw error;
    }

    const updatedRegistration = await findRegistrationById(eventId, registration.id);

    return res.json({
      message: "Check-in thủ công thành công.",
      registration: updatedRegistration
    });
  } catch (error) {
    return res.status(500).json({
      message: "Không thể check-in thủ công",
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
