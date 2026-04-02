const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

let events;
let registrations;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetData() {
  events = [
    { id: 1, title: "Workshop Git co ban", event_time: "2026-03-25 18:00:00", location: "Phong A101", description: "Huong dan Git va GitHub cho thanh vien moi", created_at: "2026-03-23 12:37:58", updated_at: "2026-03-23 12:37:58" },
    { id: 2, title: "Workshop HTML CSS JS", event_time: "2026-03-28 14:00:00", location: "Phong B203", description: "On tap nen tang frontend", created_at: "2026-03-23 12:37:58", updated_at: "2026-03-23 12:37:58" },
    { id: 3, title: "Workshop Node.js co ban", event_time: "2026-03-30 19:00:00", location: "Phong C105", description: "Lam quen backend bang Node.js", created_at: "2026-03-23 12:37:58", updated_at: "2026-03-23 12:37:58" }
  ];

  registrations = [
    { id: 1, event_id: 1, full_name: "Nguyen Van A", student_id: "SV001", email: "sv001@example.com", phone: "0900000001", checked_in_at: null, created_at: "2026-03-23 12:37:58" },
    { id: 2, event_id: 1, full_name: "Tran Thi B", student_id: "SV002", email: "sv002@example.com", phone: "0900000002", checked_in_at: "2026-03-25 17:45:00", created_at: "2026-03-23 12:40:00" },
    { id: 3, event_id: 2, full_name: "Le Van C", student_id: "SV003", email: "sv003@example.com", phone: "0900000003", checked_in_at: null, created_at: "2026-03-23 12:45:00" }
  ];
}

const mockPool = {
  async query(sql, params = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql === "SELECT 1 AS connected") {
      return [[{ connected: 1 }]];
    }

    if (normalizedSql.includes("FROM events e") && normalizedSql.includes("registration_count")) {
      return [clone(events).sort((a, b) => new Date(a.event_time) - new Date(b.event_time)).map((event) => ({ ...event, registration_count: registrations.filter((item) => item.event_id === event.id).length }))];
    }

    if (normalizedSql.includes("FROM events") && normalizedSql.includes("WHERE id = ?")) {
      const event = events.find((item) => item.id === Number(params[0]));
      return [[event ? clone(event) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("LOWER(student_id)")) {
      const [eventId, studentId, email] = params;
      const duplicated = registrations.find((item) => item.event_id === Number(eventId) && (item.student_id.toLowerCase() === String(studentId).toLowerCase() || item.email.toLowerCase() === String(email).toLowerCase()));
      return [[duplicated ? clone({ id: duplicated.id, student_id: duplicated.student_id, email: duplicated.email }) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("WHERE event_id = ? AND id = ?") && normalizedSql.includes("LIMIT 1")) {
      const [eventId, registrationId] = params;
      const registration = registrations.find((item) => item.event_id === Number(eventId) && item.id === Number(registrationId));
      return [[registration ? clone({ ...registration, check_in_status: registration.checked_in_at ? "Đã check-in" : "Chưa check-in" }) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("WHERE event_id = ?") && normalizedSql.includes("LOWER(email) = LOWER(?)") && normalizedSql.includes("UPPER(student_id) = UPPER(?)") && normalizedSql.includes("ORDER BY id DESC") && params.length === 3) {
      const [eventId, a, b] = params;
      const registration = registrations.filter((item) => item.event_id === Number(eventId) && (item.email.toLowerCase() === String(a).toLowerCase() || item.student_id.toUpperCase() === String(b).toUpperCase())).sort((x, y) => y.id - x.id)[0];
      return [[registration ? clone({ ...registration, check_in_status: registration.checked_in_at ? "Đã check-in" : "Chưa check-in" }) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("ORDER BY id DESC") && params.length === 4) {
      const [eventId, registrationId, a, b] = params;
      const registration = registrations.filter((item) => item.event_id === Number(eventId) && (item.id === Number(registrationId) || item.email.toLowerCase() === String(a).toLowerCase() || item.student_id.toUpperCase() === String(b).toUpperCase())).sort((x, y) => y.id - x.id)[0];
      return [[registration ? clone({ ...registration, check_in_status: registration.checked_in_at ? "Đã check-in" : "Chưa check-in" }) : undefined].filter(Boolean)];
    }

    if (normalizedSql.includes("UPDATE registrations") && normalizedSql.includes("SET checked_in_at = NOW()")) {
      const [eventId, registrationId] = params;
      const registration = registrations.find((item) => item.event_id === Number(eventId) && item.id === Number(registrationId) && item.checked_in_at == null);
      if (!registration) return [{ affectedRows: 0 }];
      registration.checked_in_at = "2026-03-25 18:15:00";
      return [{ affectedRows: 1 }];
    }

    if (normalizedSql.includes("FROM registrations") && normalizedSql.includes("ORDER BY created_at DESC, id DESC")) {
      return [registrations.filter((item) => item.event_id === Number(params[0])).sort((a, b) => {
        const timeDiff = new Date(b.created_at) - new Date(a.created_at);
        return timeDiff !== 0 ? timeDiff : b.id - a.id;
      }).map((item) => clone({ ...item, check_in_status: item.checked_in_at ? "Đã check-in" : "Chưa check-in" }))];
    }

    if (normalizedSql.includes("INSERT INTO registrations")) {
      const [eventId, fullName, studentId, email, phone] = params;
      const newRegistration = { id: registrations.length + 1, event_id: Number(eventId), full_name: fullName, student_id: studentId, email, phone, checked_in_at: null, created_at: "2026-03-25 10:00:00" };
      registrations.push(newRegistration);
      return [{ insertId: newRegistration.id }];
    }

    if (normalizedSql.includes("INSERT INTO events")) {
      const [title, eventTime, location, description] = params;
      const newEvent = { id: events.length + 1, title, event_time: eventTime, location, description, created_at: "2026-03-25 09:00:00", updated_at: "2026-03-25 09:00:00" };
      events.push(newEvent);
      return [{ insertId: newEvent.id }];
    }

    if (normalizedSql.includes("UPDATE events")) {
      const [title, eventTime, location, description, eventId] = params;
      const event = events.find((item) => item.id === Number(eventId));
      if (!event) return [{ affectedRows: 0 }];
      event.title = title;
      event.event_time = eventTime;
      event.location = location;
      event.description = description;
      event.updated_at = "2026-03-25 09:15:00";
      return [{ affectedRows: 1 }];
    }

    throw new Error(`Unhandled SQL in test mock: ${normalizedSql}`);
  }
};

const dbPath = path.resolve(__dirname, "../src/config/db.js");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockPool };

const app = require("../src/app");

async function withServer(run) {
  resetData();
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

test("GET /api/events/:id/registrations trả về đúng danh sách theo sự kiện và trạng thái check-in", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/1/registrations`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.event.id, 1);
    assert.equal(data.totalRegistrations, 2);
    assert.deepEqual(data.registrations.map((item) => item.full_name), ["Tran Thi B", "Nguyen Van A"]);
    assert.equal(data.registrations[0].check_in_status, "Đã check-in");
    assert.equal(data.registrations[0].checked_in_at, "2026-03-25 17:45:00");
    assert.equal(data.registrations[1].check_in_status, "Chưa check-in");
    assert.equal(data.registrations[1].checked_in_at, null);
  });
});

test("GET /api/events/:id/registrations trả về danh sách trống khi chưa có người đăng ký", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/3/registrations`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.event.id, 3);
    assert.equal(data.totalRegistrations, 0);
    assert.deepEqual(data.registrations, []);
  });
});

test("GET /api/events/:id/registrations trả về 404 nếu sự kiện không tồn tại", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/999/registrations`);
    const data = await response.json();
    assert.equal(response.status, 404);
    assert.equal(data.message, "Sự kiện không tồn tại");
  });
});

test("POST /api/registrations vẫn đăng ký thành công và mặc định chưa check-in", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: 3, full_name: "Pham Thi D", student_id: "sv010", email: "sv010@example.com", phone: "0901111222" })
    });
    const createData = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(createData.eventId, 3);

    const listResponse = await fetch(`${baseUrl}/api/events/3/registrations`);
    const listData = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listData.totalRegistrations, 1);
    assert.equal(listData.registrations[0].student_id, "SV010");
    assert.equal(listData.registrations[0].check_in_status, "Chưa check-in");
    assert.equal(listData.registrations[0].checked_in_at, null);
  });
});


test("GET /api/events/:id/registrations/search tìm được theo email, MSSV hoặc mã đăng ký", async () => {
  await withServer(async (baseUrl) => {
    const byEmail = await fetch(`${baseUrl}/api/events/1/registrations/search?keyword=sv001@example.com`);
    const emailData = await byEmail.json();
    assert.equal(byEmail.status, 200);
    assert.equal(emailData.registration.id, 1);
    assert.equal(emailData.registration.registration_code, "DK-0001");
    assert.equal(emailData.registration.is_checked_in, false);

    const byStudentId = await fetch(`${baseUrl}/api/events/1/registrations/search?keyword=sv002`);
    const studentData = await byStudentId.json();
    assert.equal(byStudentId.status, 200);
    assert.equal(studentData.registration.id, 2);
    assert.equal(studentData.registration.is_checked_in, true);

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
    assert.equal(data.registration.check_in_status, "Đã check-in");
    assert.equal(data.registration.checked_in_at, "2026-03-25 18:15:00");
  });
});

test("POST /api/events/:id/check-in/manual trả về 409 nếu đã check-in", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/1/check-in/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration_id: 2 })
    });
    const data = await response.json();
    assert.equal(response.status, 409);
    assert.equal(data.registration.id, 2);
    assert.equal(data.registration.is_checked_in, true);
  });
});
