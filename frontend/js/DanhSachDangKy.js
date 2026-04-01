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
const searchInputEl = document.getElementById("search-input");
const checkinFilterEl = document.getElementById("checkin-filter");
const checkedInSummaryEl = document.getElementById("checked-in-summary");
const notCheckedInSummaryEl = document.getElementById("not-checked-in-summary");

let eventsData = [];
let currentRegistrations = [];
let currentEvent = null;

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

function getCheckInStatusLabel(registration) {
  return registration.checked_in_at ? "Đã check-in" : "Chưa check-in";
}

function getCheckInStatusClass(registration) {
  return registration.checked_in_at ? "checked-in" : "not-checked-in";
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

function updateSummary(registrations) {
  const checkedInCount = registrations.filter((item) => item.checked_in_at).length;
  const notCheckedInCount = registrations.length - checkedInCount;

  checkedInSummaryEl.textContent = `Đã check-in: ${checkedInCount}`;
  notCheckedInSummaryEl.textContent = `Chưa check-in: ${notCheckedInCount}`;
}

function renderRegistrations(registrations) {
  registrationTableBodyEl.innerHTML = registrations
    .map((registration, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(registration.full_name)}</td>
        <td>${escapeHtml(registration.student_id)}</td>
        <td>${escapeHtml(registration.email)}</td>
        <td>${escapeHtml(registration.phone || "-")}</td>
        <td>
          <span class="status-badge ${getCheckInStatusClass(registration)}">
            ${getCheckInStatusLabel(registration)}
          </span>
        </td>
        <td>${registration.checked_in_at ? formatDate(registration.checked_in_at) : "-"}</td>
        <td>${formatDate(registration.created_at)}</td>
      </tr>
    `)
    .join("");
}

function toggleListState(hasData) {
  emptyStateEl.classList.toggle("hidden", hasData);
  tableWrapperEl.classList.toggle("hidden", !hasData);
}

function getFilteredRegistrations() {
  const keyword = String(searchInputEl.value || "").trim().toLowerCase();
  const statusFilter = checkinFilterEl.value;

  return currentRegistrations.filter((registration) => {
    const matchesKeyword = !keyword || [
      registration.full_name,
      registration.student_id,
      registration.email,
      registration.phone
    ].some((value) => String(value || "").toLowerCase().includes(keyword));

    const isCheckedIn = Boolean(registration.checked_in_at);
    const matchesStatus =
      statusFilter === "all"
      || (statusFilter === "checked_in" && isCheckedIn)
      || (statusFilter === "not_checked_in" && !isCheckedIn);

    return matchesKeyword && matchesStatus;
  });
}

function updateRegistrationView() {
  if (!currentEvent) {
    updateSummary([]);
    registrationTableBodyEl.innerHTML = "";
    registrationStatusEl.textContent = "Chưa có sự kiện để xem danh sách đăng ký.";
    toggleListState(false);
    return;
  }

  updateSummary(currentRegistrations);
  const filteredRegistrations = getFilteredRegistrations();
  renderRegistrations(filteredRegistrations);
  toggleListState(filteredRegistrations.length > 0);

  if (!currentRegistrations.length) {
    registrationStatusEl.textContent = "Sự kiện này chưa có người đăng ký.";
    return;
  }

  if (!filteredRegistrations.length) {
    registrationStatusEl.textContent = "Không có người đăng ký phù hợp với bộ lọc hiện tại.";
    return;
  }

  registrationStatusEl.textContent = `Đang hiển thị ${filteredRegistrations.length}/${currentRegistrations.length} người đăng ký cho sự kiện đã chọn.`;
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
        .map((event) => `
          <option value="${event.id}">
            ${escapeHtml(event.title)} - ${formatDate(event.event_time)}
          </option>
        `)
        .join("")
    : '<option value="">Chưa có sự kiện</option>';
}

async function handleEventChange(eventId) {
  currentEvent = eventsData.find((item) => String(item.id) === String(eventId)) || null;

  if (!currentEvent || !eventId) {
    currentRegistrations = [];
    renderSelectedEventInfo(null);
    registrationStatusEl.textContent = "Chưa có sự kiện để xem danh sách đăng ký.";
    registrationTableBodyEl.innerHTML = "";
    toggleListState(false);
    updateSummary([]);
    setHeroState({ status: "Chưa có dữ liệu" });
    updateQueryString("");
    return;
  }

  renderSelectedEventInfo(currentEvent);
  registrationStatusEl.textContent = "Đang tải danh sách người đăng ký...";
  setHeroState({
    eventTitle: currentEvent.title,
    count: Number(currentEvent.registration_count || 0),
    status: "Đang tải danh sách"
  });

  try {
    const result = await loadRegistrationsByEvent(eventId);
    currentRegistrations = Array.isArray(result.registrations) ? result.registrations : [];

    const registrationCount = Number(result.totalRegistrations || 0);
    currentEvent.registration_count = registrationCount;
    renderSelectedEventInfo(currentEvent);

    setHeroState({
      eventTitle: currentEvent.title,
      count: registrationCount,
      status: registrationCount > 0 ? "Đã tải thành công" : "Danh sách trống"
    });

    updateRegistrationView();
    updateQueryString(eventId);
  } catch (error) {
    currentRegistrations = [];
    registrationTableBodyEl.innerHTML = "";
    toggleListState(false);
    updateSummary([]);
    registrationStatusEl.textContent = "Không tải được danh sách người đăng ký.";
    setHeroState({
      eventTitle: currentEvent.title,
      count: Number(currentEvent.registration_count || 0),
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
      currentEvent = null;
      currentRegistrations = [];
      renderSelectedEventInfo(null);
      registrationStatusEl.textContent = "Hệ thống chưa có sự kiện nào.";
      setHeroState({ status: "Chưa có sự kiện" });
      updateSummary([]);
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
    currentEvent = null;
    currentRegistrations = [];
    renderSelectedEventInfo(null);
    registrationStatusEl.textContent = "Không tải được dữ liệu ban đầu.";
    setHeroState({ status: "Tải thất bại" });
    updateSummary([]);
    toggleListState(false);
    showPageMessage(error.message || "Không thể khởi tạo trang danh sách đăng ký.", "error");
    console.error(error);
  }
}

eventSelectorEl.addEventListener("change", async (event) => {
  clearPageMessage();
  await handleEventChange(event.target.value);
});

searchInputEl.addEventListener("input", () => {
  updateRegistrationView();
});

checkinFilterEl.addEventListener("change", () => {
  updateRegistrationView();
});

initializePage();
