var API_BASE_URL = window.AppConfig.API_BASE_URL;

var registrationFormEl = document.querySelector(".student-form");
var eventSelectEl = document.getElementById("event_id");
var selectedEventInfoEl = document.getElementById("selected-event-info");
var registrationMessageEl = document.getElementById("registration-message");
var submitButtonEl = registrationFormEl && registrationFormEl.querySelector('button[type="submit"]');
var toastContainerEl = document.getElementById("toast-container");
var activeToastTimer = null;
var eventsData = [];

function formatDate(dateString) {
  var date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getEventIdFromUrl() {
  var params = new URLSearchParams(window.location.search);
  return params.get("eventId");
}

function showRegistrationMessage(message, type) {
  if (!registrationMessageEl) {
    return;
  }

  registrationMessageEl.textContent = message;
  registrationMessageEl.className = "form-message " + type;
}

function clearRegistrationMessage() {
  if (!registrationMessageEl) {
    return;
  }

  registrationMessageEl.textContent = "";
  registrationMessageEl.className = "form-message";
}

function showToast(message, type) {
  if (!toastContainerEl) {
    return;
  }

  if (activeToastTimer) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }

  var toastEl = document.createElement("div");
  toastEl.className = "toast " + (type || "success");
  toastEl.setAttribute("role", "status");
  toastEl.innerHTML = [
    '<div class="toast-icon">' + ((type || "success") === "success" ? "✓" : "!") + '</div>',
    '<div class="toast-content">',
    '<strong>' + (((type || "success") === "success") ? "Đăng ký thành công" : "Thông báo") + '</strong>',
    '<span>' + escapeHtml(message) + '</span>',
    '</div>'
  ].join("");

  toastContainerEl.innerHTML = "";
  toastContainerEl.appendChild(toastEl);

  requestAnimationFrame(function () {
    toastEl.classList.add("show");
  });

  activeToastTimer = window.setTimeout(function () {
    toastEl.classList.remove("show");
    window.setTimeout(function () {
      if (toastEl.parentElement === toastContainerEl) {
        toastContainerEl.innerHTML = "";
      }
    }, 220);
  }, 3200);
}

function renderSelectedEventInfo(eventId) {
  var event = eventsData.find(function (item) {
    return String(item.id) === String(eventId);
  });

  if (!event) {
    selectedEventInfoEl.innerHTML = "";
    return;
  }

  selectedEventInfoEl.innerHTML = [
    '<div class="event-preview-card">',
    '<h3>' + escapeHtml(event.title) + '</h3>',
    '<p><strong>Thời gian:</strong> ' + formatDate(event.event_time) + '</p>',
    '<p><strong>Địa điểm:</strong> ' + escapeHtml(event.location) + '</p>',
    '<p><strong>Mô tả:</strong> ' + escapeHtml(event.description || "Không có mô tả") + '</p>',
    '</div>'
  ].join("");
}

async function loadEventsForRegistration() {
  try {
    var response = await fetch(API_BASE_URL + "/events");
    var events = await window.AppConfig.readJsonSafely(response);

    if (!response.ok) {
      throw new Error((events && events.message) || "Không tải được danh sách sự kiện");
    }

    eventsData = Array.isArray(events) ? events : [];

    eventSelectEl.innerHTML = [
      '<option value="">Chọn sự kiện</option>',
      eventsData.map(function (event) {
        return '<option value="' + event.id + '">' + escapeHtml(event.title) + ' - ' + formatDate(event.event_time) + '</option>';
      }).join("")
    ].join("");

    var eventIdFromUrl = getEventIdFromUrl();
    if (eventIdFromUrl) {
      eventSelectEl.value = eventIdFromUrl;
      renderSelectedEventInfo(eventIdFromUrl);
    }
  } catch (error) {
    console.error(error);
    eventSelectEl.innerHTML = '<option value="">Không tải được sự kiện</option>';
    showRegistrationMessage("Không tải được danh sách sự kiện để đăng ký.", "error");
  }
}

async function submitRegistration(payload) {
  var response = await fetch(API_BASE_URL + "/registrations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  var result = await window.AppConfig.readJsonSafely(response);

  if (!response.ok) {
    var error = new Error((result && result.message) || "Đăng ký thất bại");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

if (eventSelectEl) {
  eventSelectEl.addEventListener("change", function (event) {
    clearRegistrationMessage();
    renderSelectedEventInfo(event.target.value);
  });
}

if (registrationFormEl) {
  registrationFormEl.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearRegistrationMessage();

    var formData = new FormData(registrationFormEl);
    var payload = {
      event_id: formData.get("event_id"),
      full_name: formData.get("full_name"),
      student_id: formData.get("student_id"),
      class_name: formData.get("class_name"),
      faculty: formData.get("faculty"),
      email: formData.get("email"),
      phone: formData.get("phone")
    };

    try {
      if (submitButtonEl) {
        submitButtonEl.disabled = true;
      }

      showRegistrationMessage("Đang gửi đăng ký...", "info");
      var result = await submitRegistration(payload);

      registrationFormEl.reset();
      var eventId = String((result && result.eventId) || payload.event_id || "");
      if (eventId) {
        eventSelectEl.value = eventId;
        renderSelectedEventInfo(eventId);
      } else {
        selectedEventInfoEl.innerHTML = "";
      }

      showRegistrationMessage((result && result.message) || "Đăng ký tham gia thành công.", "success");
      showToast((result && result.message) || "Đăng ký tham gia thành công.", "success");
    } catch (error) {
      if (error.status === 409) {
        showRegistrationMessage((error.payload && error.payload.message) || "Bạn đã đăng ký sự kiện này rồi.", "error");
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

  registrationFormEl.addEventListener("reset", function () {
    window.setTimeout(function () {
      clearRegistrationMessage();
      selectedEventInfoEl.innerHTML = "";
    }, 0);
  });
}

loadEventsForRegistration();
