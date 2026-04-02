function getApiBaseUrl() {
  const isLocalBrowserHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isBackendOrigin = isLocalBrowserHost && window.location.port === "5000";

  if (window.location.protocol === "file:" || (isLocalBrowserHost && !isBackendOrigin)) {
    return "http://localhost:5000/api";
  }

  return `${window.location.origin}/api`;
}

const API_BASE_URL = getApiBaseUrl();

const registrationFormEl = document.querySelector(".student-form");
const eventSelectEl = document.getElementById("event_id");
const selectedEventInfoEl = document.getElementById("selected-event-info");
const registrationMessageEl = document.getElementById("registration-message");
const submitButtonEl = registrationFormEl?.querySelector('button[type="submit"]');
const toastContainerEl = document.getElementById("toast-container");
let activeToastTimer = null;

let eventsData = [];

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function getEventIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("eventId");
}

function showRegistrationMessage(message, type) {
  if (!registrationMessageEl) return;
  registrationMessageEl.textContent = message;
  registrationMessageEl.className = `form-message ${type}`;
}

function clearRegistrationMessage() {
  if (!registrationMessageEl) return;
  registrationMessageEl.textContent = "";
  registrationMessageEl.className = "form-message";
}

function showToast(message, type = "success") {
  if (!toastContainerEl) return;

  if (activeToastTimer) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }

  const toastEl = document.createElement("div");
  toastEl.className = `toast ${type}`;
  toastEl.setAttribute("role", "status");
  toastEl.innerHTML = `
    <div class="toast-icon">${type === "success" ? "✓" : "!"}</div>
    <div class="toast-content">
      <strong>${type === "success" ? "Đăng ký thành công" : "Thông báo"}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  toastContainerEl.innerHTML = "";
  toastContainerEl.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.classList.add("show");
  });

  activeToastTimer = window.setTimeout(() => {
    toastEl.classList.remove("show");
    window.setTimeout(() => {
      if (toastEl.parentElement === toastContainerEl) {
        toastContainerEl.innerHTML = "";
      }
    }, 220);
  }, 3200);
}


function renderSelectedEventInfo(eventId) {
  const event = eventsData.find((item) => String(item.id) === String(eventId));

  if (!event) {
    selectedEventInfoEl.innerHTML = "";
    return;
  }

  selectedEventInfoEl.innerHTML = `
    <div class="event-preview-card">
      <h3>${escapeHtml(event.title)}</h3>
      <p><strong>Thời gian:</strong> ${formatDate(event.event_time)}</p>
      <p><strong>Địa điểm:</strong> ${escapeHtml(event.location)}</p>
      <p><strong>Mô tả:</strong> ${escapeHtml(event.description || "Không có mô tả")}</p>
    </div>
  `;
}

async function loadEventsForRegistration() {
  try {
    const response = await fetch(`${API_BASE_URL}/events`);
    const events = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(events?.message || "Không tải được danh sách sự kiện");
    }

    eventsData = Array.isArray(events) ? events : [];

    eventSelectEl.innerHTML = `
      <option value="">-- Chọn sự kiện muốn tham gia --</option>
      ${eventsData
        .map(
          (event) => `
            <option value="${event.id}">
              ${escapeHtml(event.title)} - ${formatDate(event.event_time)}
            </option>
          `
        )
        .join("")}
    `;

    const eventIdFromUrl = getEventIdFromUrl();
    if (eventIdFromUrl) {
      eventSelectEl.value = eventIdFromUrl;
      renderSelectedEventInfo(eventIdFromUrl);
    }
  } catch (error) {
    console.error(error);
    eventSelectEl.innerHTML = `<option value="">Không tải được sự kiện</option>`;
    showRegistrationMessage("Không tải được danh sách sự kiện để đăng ký.", "error");
  }
}

async function submitRegistration(payload) {
  const response = await fetch(`${API_BASE_URL}/registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(result?.message || "Đăng ký thất bại");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

if (eventSelectEl) {
  eventSelectEl.addEventListener("change", (e) => {
    clearRegistrationMessage();
    renderSelectedEventInfo(e.target.value);
  });
}

if (registrationFormEl) {
  registrationFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearRegistrationMessage();

    const formData = new FormData(registrationFormEl);
    const payload = {
      event_id: formData.get("event_id"),
      full_name: formData.get("full_name"),
      student_id: formData.get("student_id"),
      email: formData.get("email"),
      phone: formData.get("phone")
    };

    try {
      if (submitButtonEl) {
        submitButtonEl.disabled = true;
      }

      showRegistrationMessage("Hệ thống đang xử lý đăng ký...", "success");
      const result = await submitRegistration(payload);

      registrationFormEl.reset();
      const eventId = String(result.eventId || payload.event_id || "");
      if (eventId) {
        eventSelectEl.value = eventId;
        renderSelectedEventInfo(eventId);
      } else {
        selectedEventInfoEl.innerHTML = "";
      }

      showRegistrationMessage(result.message, "success");
      showToast(result.message || "Đăng ký tham gia thành công.", "success");
    } catch (error) {
      if (error.status === 409) {
        showRegistrationMessage(
          error.payload?.message || "Sinh viên đã đăng ký sự kiện này rồi.",
          "error"
        );
      } else {
        showRegistrationMessage(error.message || "Không thể gửi đăng ký.", "error");
      }
      console.error(error);
    } finally {
      if (submitButtonEl) {
        submitButtonEl.disabled = false;
      }
    }
  });

  registrationFormEl.addEventListener("reset", () => {
    window.setTimeout(() => {
      clearRegistrationMessage();
      selectedEventInfoEl.innerHTML = "";
    }, 0);
  });
}

loadEventsForRegistration();
