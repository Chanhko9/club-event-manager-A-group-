const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

let events;
let registrations;
let registrationEmailLogs;
let sentEmails;
let forcedSendError;
let registrationColumns;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildMockQrPayload(event, registration) {
  return [
    "VE THAM DU SU KIEN",
    `Ma dang ky: ${registration.id}`,
    `Su kien: ${event.title}`,
    `Thoi gian: ${event.event_time}`,
    `Dia diem: ${event.location}`,
    `Ho va ten: ${registration.full_name}`,
    `MSSV: ${registration.student_id}`,
    `Email: ${registration.email}`,
    `So dien thoai: ${registration.phone || ""}`
  ].join("\n");
}

function resetData() {
  events = [
    { id: 1, title: "Workshop Git co ban", event_time: "2026-03-25 18:00:00", location: "Phong A101", description: "Huong dan Git va GitHub cho thanh vien moi", created_at: "2026-03-23 12:37:58", updated_at: "2026-03-23 12:37:58" },
    { id: 2, title: "Workshop HTML CSS JS", event_time: "2026-03-28 14:00:00", location: "Phong B203", description: "On tap nen tang frontend", created_at: "2026-03-23 12:37:58", updated_at: "2026-03-23 12:37:58" },
    { id: 3, title: "Workshop Node.js co ban", event_time: "2026-03-30 19:00:00", location: "Phong C105", description: "Lam quen backend bang Node.js", created_at: "2026-03-23 12:37:58", updated_at: "2026-03-23 12:37:58" }
  ];

  registrations = [
    {
      id: 1,
      event_id: 1,
      full_name: "Nguyen Van A",
      student_id: "SV001",
      email: "sv001@example.com",
      phone: "0900000001",
      qr_code: "DK-0001",
      qr_payload: JSON.stringify({ registrationId: 1, eventId: 1, studentId: "SV001", email: "sv001@example.com" }),
      qr_created_at: "2026-03-23 12:38:00",
      email_delivery_status: "Đã gửi",
      email_sent_at: "2026-03-23 12:39:00",
      email_error_message: null,
      checked_in_at: null,
      created_at: "2026-03-23 12:37:58"
    },
    {
      id: 2,
      event_id: 1,
      full_name: "Tran Thi B",
      student_id: "SV002",
      email: "sv002@example.com",
      phone: "0900000002",
      qr_code: "DK-0002",
      qr_payload: buildMockQrPayload(events?.[0] || { title: "Workshop Git co ban", event_time: "2026-03-25 18:00:00", location: "Phong A101" }, {
        id: 2,
        full_name: "Tran Thi B",
        student_id: "SV002",
        email: "sv002@example.com",
        phone: "0900000002"
      }),
      qr_created_at: "2026-03-23 12:40:00",
      email_delivery_status: "Đã gửi",
      email_sent_at: "2026-03-23 12:41:00",
      email_error_message: null,
      checked_in_at: "2026-03-25 17:45:00",
      created_at: "2026-03-23 12:40:00"
    },
    {
      id: 3,
      event_id: 2,
      full_name: "Le Van C",
      student_id: "SV003",
      email: "sv003@example.com",
      phone: "0900000003",
      qr_code: "DK-0003",
      qr_payload: buildMockQrPayload(events?.[1] || { title: "Workshop HTML CSS JS", event_time: "2026-03-28 14:00:00", location: "Phong B203" }, {
        id: 3,
        full_name: "Le Van C",
        student_id: "SV003",
        email: "sv003@example.com",
        phone: "0900000003"
      }),
      qr_created_at: "2026-03-23 12:45:00",
      email_delivery_status: "Chờ gửi",
      email_sent_at: null,
      email_error_message: null,
      checked_in_at: null,
      created_at: "2026-03-23 12:45:00"
    }
  ];

  registrationEmailLogs = [];
  sentEmails = [];
  forcedSendError = null;
  registrationColumns = new Set([
    "id",
    "event_id",
    "full_name",
    "student_id",
    "email",
    "phone",
    "qr_code",
    "qr_payload",
    "qr_created_at",
    "email_delivery_status",
    "email_sent_at",
    "email_error_message",
    "checked_in_at",
    "created_at"
  ]);
}

function buildRegistrationCode(registrationId) {
  return `DK-${String(registrationId).padStart(4, "0")}`;
}

function findEvent(eventId) {
  return events.find((item) => item.id === Number(eventId)) || null;
}

function findRegistration(registrationId) {
  return registrations.find((item) => item.id === Number(registrationId)) || null;
}

function findRegistrationForEvent(eventId, registrationId) {
  return registrations.find((item) => item.event_id === Number(eventId) && item.id === Number(registrationId)) || null;
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function toRegistrationRow(registration) {
  return clone({
    ...registration,
    check_in_status: registration.checked_in_at ? "Đã check-in" : "Chưa check-in"
  });
}

resetData();

const mockPool = {
  async query(sql, params = []) {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql === "SELECT 1 AS connected") {
      return [[{ connected: 1 }]];
    }

    if (normalizedSql.startsWith("SHOW COLUMNS FROM registrations LIKE ?")) {
      const columnName = String(params[0]);
      return [registrationColumns.has(columnName) ? [{ Field: columnName }] : []];
    }

    if (normalizedSql.startsWith("ALTER TABLE registrations ADD COLUMN")) {
      const match = normalizedSql.match(/ADD COLUMN ([a-z_]+)/i);
      if (match) {
        registrationColumns.add(match[1]);
      }
      return [{ affectedRows: 0 }];
    }

    if (normalizedSql.startsWith("CREATE TABLE IF NOT EXISTS feedback_forms") ||
        normalizedSql.startsWith("CREATE TABLE IF NOT EXISTS feedback_responses") ||
        normalizedSql.startsWith("CREATE TABLE IF NOT EXISTS registration_email_logs")) {
      return [{ warningStatus: 0 }];
    }

    if (normalizedSql.includes("FROM events e") && normalizedSql.includes("registration_count")) {
      return [clone(events)
        .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
        .map((event) => ({ ...event, registration_count: registrations.filter((item) => item.event_id === event.id).length }))];
    }

    if (normalizedSql.includes("FROM events") && normalizedSql.includes("WHERE id = ?")) {
      const event = findEvent(params[0]);
      return [[event ? clone(event) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("WHERE event_id = ?") && normalizedSql.includes("(LOWER(student_id) = LOWER(?) OR LOWER(email) = LOWER(?))")) {
      const [eventId, studentId, email] = params;
      const duplicated = registrations.find((item) =>
        item.event_id === Number(eventId)
        && (item.student_id.toLowerCase() === String(studentId).toLowerCase() || item.email.toLowerCase() === String(email).toLowerCase())
      );
      return [[duplicated ? clone({ id: duplicated.id, student_id: duplicated.student_id, email: duplicated.email }) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("WHERE event_id = ? AND id = ?") && normalizedSql.includes("LIMIT 1")) {
      const registration = findRegistrationForEvent(params[0], params[1]);
      return [[registration ? toRegistrationRow(registration) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("WHERE id = ?") && normalizedSql.includes("LIMIT 1")) {
      const registration = findRegistration(params[0]);
      return [[registration ? clone(registration) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("LOWER(email) = LOWER(?)") && normalizedSql.includes("UPPER(student_id) = UPPER(?)") && normalizedSql.includes("ORDER BY id DESC") && params.length === 3) {
      const [eventId, email, studentId] = params;
      const registration = registrations
        .filter((item) => item.event_id === Number(eventId) && (item.email.toLowerCase() === String(email).toLowerCase() || item.student_id.toUpperCase() === String(studentId).toUpperCase()))
        .sort((a, b) => b.id - a.id)[0];
      return [[registration ? toRegistrationRow(registration) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("ORDER BY id DESC") && params.length === 4) {
      const [eventId, registrationId, email, studentId] = params;
      const registration = registrations
        .filter((item) => item.event_id === Number(eventId)
          && (item.id === Number(registrationId)
            || item.email.toLowerCase() === String(email).toLowerCase()
            || item.student_id.toUpperCase() === String(studentId).toUpperCase()))
        .sort((a, b) => b.id - a.id)[0];
      return [[registration ? toRegistrationRow(registration) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("ORDER BY created_at DESC, id DESC")) {
      const eventId = Number(params[0]);
      let result = registrations.filter((item) => item.event_id === eventId);

      const whereCheckedIn = normalizedSql.includes("WHERE event_id = ? AND checked_in_at IS NOT NULL");
      const whereNotCheckedIn = normalizedSql.includes("WHERE event_id = ? AND checked_in_at IS NULL");

      if (whereCheckedIn) {
        result = result.filter((item) => item.checked_in_at != null);
      }
      if (whereNotCheckedIn) {
        result = result.filter((item) => item.checked_in_at == null);
      }

      if (params.length > 1) {
        const keyword = String(params[1]).replace(/%/g, "").toLowerCase();
        result = result.filter((item) =>
          item.full_name.toLowerCase().includes(keyword)
          || item.student_id.toLowerCase().includes(keyword)
          || item.email.toLowerCase().includes(keyword)
          || String(item.phone || "").toLowerCase().includes(keyword)
        );
      }

      result = result.sort((a, b) => {
        const timeDiff = new Date(b.created_at) - new Date(a.created_at);
        return timeDiff !== 0 ? timeDiff : b.id - a.id;
      });

      return [result.map(toRegistrationRow)];
    }

    if (normalizedSql.includes("INSERT INTO registrations (event_id, full_name, student_id, email, phone)")) {
      const [eventId, fullName, studentId, email, phone] = params;
      const newRegistration = {
        id: registrations.length + 1,
        event_id: Number(eventId),
        full_name: fullName,
        student_id: studentId,
        email,
        phone,
        qr_code: null,
        qr_payload: null,
        qr_created_at: null,
        email_delivery_status: "Chờ gửi",
        email_sent_at: null,
        email_error_message: null,
        checked_in_at: null,
        created_at: "2026-03-25 10:00:00"
      };
      registrations.push(newRegistration);
      return [{ insertId: newRegistration.id }];
    }

    if (normalizedSql.includes("UPDATE registrations") && normalizedSql.includes("SET qr_code = ?") && normalizedSql.includes("qr_payload = ?") && normalizedSql.includes("qr_created_at = NOW()")) {
      const [qrCode, qrPayload, registrationId] = params;
      const registration = findRegistration(registrationId);
      if (!registration) return [{ affectedRows: 0 }];
      registration.qr_code = qrCode;
      registration.qr_payload = qrPayload;
      registration.qr_created_at = "2026-03-25 10:00:01";
      return [{ affectedRows: 1 }];
    }

    if (normalizedSql.includes("UPDATE registrations") && normalizedSql.includes("SET email_delivery_status = ?")) {
      const [status, emailSentAt, errorMessage, registrationId] = params;
      const registration = findRegistration(registrationId);
      if (!registration) return [{ affectedRows: 0 }];
      registration.email_delivery_status = status;
      registration.email_sent_at = emailSentAt ? "2026-03-25 10:00:02" : null;
      registration.email_error_message = errorMessage;
      return [{ affectedRows: 1 }];
    }

    if (normalizedSql.includes("INSERT INTO registration_email_logs")) {
      const [registrationId, eventId, recipientEmail, sendType, deliveryStatus, messageId, errorMessage, qrPayload] = params;
      const newLog = {
        id: registrationEmailLogs.length + 1,
        registration_id: Number(registrationId),
        event_id: Number(eventId),
        recipient_email: recipientEmail,
        send_type: sendType,
        delivery_status: deliveryStatus,
        message_id: messageId,
        error_message: errorMessage,
        qr_payload: qrPayload,
        created_at: `2026-03-25 10:00:${String(registrationEmailLogs.length + 10).padStart(2, "0")}`
      };
      registrationEmailLogs.push(newLog);
      return [{ insertId: newLog.id }];
    }

    if (normalizedSql.includes("UPDATE registrations") && normalizedSql.includes("SET checked_in_at = NOW()")) {
      const [eventId, registrationId] = params;
      const registration = findRegistrationForEvent(eventId, registrationId);
      if (!registration || registration.checked_in_at != null) return [{ affectedRows: 0 }];
      registration.checked_in_at = "2026-03-25 18:15:00";
      return [{ affectedRows: 1 }];
    }

    throw new Error(`Unhandled SQL in test mock: ${normalizedSql}`);
  }
};

const mockEmailService = {
  EMAIL_STATUS: Object.freeze({
    PENDING: "Chờ gửi",
    SENT: "Đã gửi",
    FAILED: "Gửi thất bại"
  }),
  buildQrPayload({ event, registration }) {
    return buildMockQrPayload(event, registration);
  },
  async sendConfirmationEmail({ event, registration, qrPayload }) {
    if (forcedSendError) {
      throw new Error(forcedSendError);
    }

    const resolvedQrPayload = qrPayload || buildMockQrPayload(event, registration);
    sentEmails.push({
      event: clone(event),
      registration: clone(registration),
      qrPayload: resolvedQrPayload
    });

    return {
      messageId: `mock-message-${sentEmails.length}`,
      qrPayload: resolvedQrPayload,
      subject: `[Xac nhan dang ky] ${event.title}`
    };
  }
};

const dbPath = path.resolve(__dirname, "../src/config/db.js");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockPool };

const emailServicePath = path.resolve(__dirname, "../src/services/confirmationEmailService.js");
require.cache[emailServicePath] = { id: emailServicePath, filename: emailServicePath, loaded: true, exports: mockEmailService };

const app = require("../src/app");

async function withServer(run) {
  resetData();
  await app.appReady;

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("GET /api/events trả về danh sách sự kiện kèm registration_count", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.length, 3);
    assert.equal(data[0].registration_count, 2);
    assert.equal(data[1].registration_count, 1);
    assert.equal(data[2].registration_count, 0);
  });
});

test("GET /api/events/:id/registrations trả về đúng danh sách theo sự kiện và trạng thái email/check-in", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/1/registrations`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.event.id, 1);
    assert.equal(data.totalRegistrations, 2);
    assert.deepEqual(data.registrations.map((item) => item.full_name), ["Tran Thi B", "Nguyen Van A"]);
    assert.equal(data.registrations[0].email_delivery_status, "Đã gửi");
    assert.equal(data.registrations[0].check_in_status, "Đã check-in");
    assert.equal(data.registrations[1].check_in_status, "Chưa check-in");
  });
});

test("GET /api/events/:id/registrations/search tìm được theo email, MSSV hoặc mã đăng ký", async () => {
  await withServer(async (baseUrl) => {
    const byEmail = await fetch(`${baseUrl}/api/events/1/registrations/search?keyword=sv001@example.com`);
    const emailData = await byEmail.json();
    assert.equal(byEmail.status, 200);
    assert.equal(emailData.registration.id, 1);
    assert.equal(emailData.registration.registration_code, "DK-0001");

    const byStudentId = await fetch(`${baseUrl}/api/events/1/registrations/search?keyword=sv002`);
    const studentData = await byStudentId.json();
    assert.equal(byStudentId.status, 200);
    assert.equal(studentData.registration.id, 2);

    const byCode = await fetch(`${baseUrl}/api/events/1/registrations/search?keyword=DK-0001`);
    const codeData = await byCode.json();
    assert.equal(byCode.status, 200);
    assert.equal(codeData.registration.id, 1);
  });
});

test("POST /api/events/:id/check-in/manual cập nhật thời gian check-in", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/1/check-in/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration_id: 1 })
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.registration.id, 1);
    assert.equal(data.registration.is_checked_in, true);
    assert.equal(data.registration.checked_in_at, "2026-03-25 18:15:00");
  });
});

test("POST /api/registrations đăng ký thành công, gửi email xác nhận và lưu QR payload chuẩn", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: 3, full_name: "Pham Thi D", student_id: "sv010", email: "sv010@example.com", phone: "0901111222" })
    });
    const data = await response.json();

    assert.equal(response.status, 201);
    assert.equal(data.eventId, 3);
    assert.equal(data.emailDeliveryStatus, "Đã gửi");
    assert.equal(data.qrCode, "DK-0004");
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].registration.email, "sv010@example.com");
    assert.equal(data.qrPayload, sentEmails[0].qrPayload);
    assert.equal(registrationEmailLogs.length, 1);
    assert.equal(registrationEmailLogs[0].send_type, "initial");
    assert.equal(registrationEmailLogs[0].delivery_status, "Đã gửi");
  });
});

test("POST /api/events/:eventId/registrations/:registrationId/resend-confirmation-email gửi lại đúng QR đã chuẩn hóa và lưu lịch sử resend", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/1/registrations/1/resend-confirmation-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    const expectedQrPayload = buildMockQrPayload(findEvent(1), findRegistration(1));

    assert.equal(response.status, 200);
    assert.equal(data.message, "Đã gửi lại email xác nhận thành công.");
    assert.equal(data.qrPayload, expectedQrPayload);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].qrPayload, expectedQrPayload);
    assert.equal(data.registration.email_delivery_status, "Đã gửi");
    assert.equal(findRegistration(1).qr_payload, expectedQrPayload);
    assert.equal(registrationEmailLogs.length, 1);
    assert.equal(registrationEmailLogs[0].send_type, "resend");
    assert.equal(registrationEmailLogs[0].delivery_status, "Đã gửi");
  });
});

test("POST /api/events/:eventId/registrations/:registrationId/resend-confirmation-email trả lỗi phù hợp khi email không hợp lệ", async () => {
  await withServer(async (baseUrl) => {
    findRegistration(1).email = "email-khong-hop-le";

    const response = await fetch(`${baseUrl}/api/events/1/registrations/1/resend-confirmation-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.message, "Email người đăng ký không hợp lệ.");
    assert.equal(sentEmails.length, 0);
    assert.equal(findRegistration(1).email_delivery_status, "Gửi thất bại");
    assert.equal(registrationEmailLogs.length, 1);
    assert.equal(registrationEmailLogs[0].send_type, "resend");
    assert.equal(registrationEmailLogs[0].delivery_status, "Gửi thất bại");
  });
});

test("POST /api/events/:eventId/registrations/:registrationId/resend-confirmation-email trả lỗi phù hợp khi gửi email thất bại", async () => {
  await withServer(async (baseUrl) => {
    forcedSendError = "SMTP unavailable";

    const response = await fetch(`${baseUrl}/api/events/1/registrations/1/resend-confirmation-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    assert.equal(response.status, 502);
    assert.equal(data.message, "Gửi lại email xác nhận thất bại.");
    assert.equal(data.error, "SMTP unavailable");
    assert.equal(findRegistration(1).email_delivery_status, "Gửi thất bại");
    assert.equal(registrationEmailLogs.length, 1);
    assert.equal(registrationEmailLogs[0].send_type, "resend");
    assert.equal(registrationEmailLogs[0].delivery_status, "Gửi thất bại");
    assert.equal(registrationEmailLogs[0].error_message, "SMTP unavailable");
  });
});
