function getApiBaseUrl() {
  const isLocalBrowserHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isBackendOrigin = isLocalBrowserHost && window.location.port === "5000";

  if (window.location.protocol === "file:" || (isLocalBrowserHost && !isBackendOrigin)) {
    return "http://localhost:5000/api";
  }

  return `${window.location.origin}/api`;
}

const API_BASE_URL = getApiBaseUrl();

const eventSelectorEl = document.getElementById("event-selector");
const selectedEventInfoEl = document.getElementById("selected-event-info");
const registrationTableBodyEl = document.getElementById("registration-table-body");
const pageMessageEl = document.getElementById("page-message");
const registrationStatusEl = document.getElementById("registration-status");
const emptyStateEl = document.getElementById("empty-state");
const tableWrapperEl = document.getElementById("table-wrapper");
const heroEventTitleEl = document.getElementById("hero-event-title");
const heroRegistrationCountEl = document.getElementById("hero-registration-count");
const heroRegistrationStatusEl = document.getElementById("hero-registration-status");
const registrationFormLinkEl = document.getElementById("registration-form-link");

let eventsData = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(dateString) {
  if (!dateString) return "Chưa cập nhật";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Không hợp lệ";
  return date.toLocaleString("vi-VN");
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

function updateQueryString(eventId) {
  const url = new URL(window.location.href);
  if (eventId) {
    url.searchParams.set("eventId", eventId);
  } else {
    url.searchParams.delete("eventId");
  }
  window.history.replaceState({}, "", url);
}

function showPageMessage(message, type) {
  pageMessageEl.textContent = message;
  pageMessageEl.className = `form-message ${type}`;
}

function clearPageMessage() {
  pageMessageEl.textContent = "";
  pageMessageEl.className = "form-message";
}

function setHeroState({ eventTitle = "Chưa chọn sự kiện", count = 0, status = "Sẵn sàng" }) {
  heroEventTitleEl.textContent = eventTitle;
  heroRegistrationCountEl.textContent = `${count} người`;
  heroRegistrationStatusEl.textContent = status;
}

function renderSelectedEventInfo(event) {
  if (!event) {
    selectedEventInfoEl.className = "event-preview-card empty-card";
    selectedEventInfoEl.innerHTML = "Chưa có sự kiện nào để hiển thị.";
    registrationFormLinkEl.href = "./FormDangKy.html";
    return;
  }

  registrationFormLinkEl.href = `./FormDangKy.html?eventId=${event.id}`;
  selectedEventInfoEl.className = "event-preview-card";
  selectedEventInfoEl.innerHTML = `
    <div class="event-info-header">
      <div>
        <p class="mini-label">Thông tin sự kiện</p>
        <h3>${escapeHtml(event.title)}</h3>
      </div>
      <span class="event-id-badge">Mã sự kiện #${event.id}</span>
    </div>
    <div class="event-info-grid">
      <div>
        <span class="info-label">Thời gian</span>
        <strong>${formatDate(event.event_time)}</strong>
      </div>
      <div>
        <span class="info-label">Địa điểm</span>
        <strong>${escapeHtml(event.location)}</strong>
      </div>
      <div>
        <span class="info-label">Mô tả</span>
        <strong>${escapeHtml(event.description || "Không có mô tả")}</strong>
      </div>
      <div>
        <span class="info-label">Tổng đăng ký hiện có</span>
        <strong>${Number(event.registration_count || 0)} người</strong>
      </div>
    </div>
  `;
}

function renderRegistrations(registrations) {
  registrationTableBodyEl.innerHTML = registrations
    .map(
      (registration, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(registration.full_name)}</td>
          <td>${escapeHtml(registration.student_id)}</td>
          <td>${escapeHtml(registration.email)}</td>
          <td>${escapeHtml(registration.phone || "-")}</td>
          <td>${formatDate(registration.created_at)}</td>
        </tr>
      `
    )
    .join("");
}

function toggleListState(hasData) {
  emptyStateEl.classList.toggle("hidden", hasData);
  tableWrapperEl.classList.toggle("hidden", !hasData);
}

async function loadEvents() {
  const response = await fetch(`${API_BASE_URL}/events`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không tải được danh sách sự kiện");
  }

  return Array.isArray(result) ? result : [];
}

async function loadRegistrationsByEvent(eventId) {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/registrations`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không tải được danh sách người đăng ký");
  }

  return result;
}

function renderEventSelector(events) {
  eventSelectorEl.innerHTML = events.length
    ? events
        .map(
          (event) => `
            <option value="${event.id}">
              ${escapeHtml(event.title)} - ${formatDate(event.event_time)}
            </option>
          `
        )
        .join("")
    : '<option value="">Chưa có sự kiện</option>';
}

async function handleEventChange(eventId) {
  const selectedEvent = eventsData.find((item) => String(item.id) === String(eventId));

  if (!selectedEvent || !eventId) {
    renderSelectedEventInfo(null);
    registrationStatusEl.textContent = "Chưa có sự kiện để xem danh sách đăng ký.";
    registrationTableBodyEl.innerHTML = "";
    toggleListState(false);
    setHeroState({ status: "Chưa có dữ liệu" });
    updateQueryString("");
    return;
  }

  renderSelectedEventInfo(selectedEvent);
  registrationStatusEl.textContent = "Đang tải danh sách người đăng ký...";
  setHeroState({
    eventTitle: selectedEvent.title,
    count: Number(selectedEvent.registration_count || 0),
    status: "Đang tải danh sách"
  });

  try {
    const result = await loadRegistrationsByEvent(eventId);
    renderRegistrations(result.registrations);

    const registrationCount = Number(result.totalRegistrations || 0);
    selectedEvent.registration_count = registrationCount;
    renderSelectedEventInfo(selectedEvent);

    registrationStatusEl.textContent = `Đang hiển thị ${registrationCount} người đăng ký cho sự kiện đã chọn.`;
    setHeroState({
      eventTitle: selectedEvent.title,
      count: registrationCount,
      status: registrationCount > 0 ? "Đã tải thành công" : "Danh sách trống"
    });

    toggleListState(registrationCount > 0);
    updateQueryString(eventId);
  } catch (error) {
    registrationTableBodyEl.innerHTML = "";
    toggleListState(false);
    registrationStatusEl.textContent = "Không tải được danh sách người đăng ký.";
    setHeroState({
      eventTitle: selectedEvent.title,
      count: Number(selectedEvent.registration_count || 0),
      status: "Tải thất bại"
    });
    showPageMessage(error.message, "error");
    console.error(error);
  }
}

async function initializePage() {
  try {
    clearPageMessage();
    registrationStatusEl.textContent = "Đang tải danh sách sự kiện...";

    eventsData = await loadEvents();
    renderEventSelector(eventsData);

    if (!eventsData.length) {
      renderSelectedEventInfo(null);
      registrationStatusEl.textContent = "Hệ thống chưa có sự kiện nào.";
      setHeroState({ status: "Chưa có sự kiện" });
      toggleListState(false);
      return;
    }

    const eventIdFromUrl = getEventIdFromUrl();
    const fallbackEventId = String(eventsData[0].id);
    const selectedEventId = eventsData.some((event) => String(event.id) === String(eventIdFromUrl))
      ? String(eventIdFromUrl)
      : fallbackEventId;

    eventSelectorEl.value = selectedEventId;
    await handleEventChange(selectedEventId);
  } catch (error) {
    renderSelectedEventInfo(null);
    registrationStatusEl.textContent = "Không tải được dữ liệu ban đầu.";
    setHeroState({ status: "Tải thất bại" });
    toggleListState(false);
    showPageMessage(error.message || "Không thể khởi tạo trang danh sách đăng ký.", "error");
    console.error(error);
  }
}

eventSelectorEl.addEventListener("change", async (event) => {
  clearPageMessage();
  await handleEventChange(event.target.value);
});

initializePage();
