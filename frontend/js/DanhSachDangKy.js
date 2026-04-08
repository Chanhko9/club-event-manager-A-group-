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
const manualCheckinFormEl = document.getElementById("manual-checkin-form");
const manualCheckinKeywordEl = document.getElementById("manual-checkin-keyword");
const manualCheckinMessageEl = document.getElementById("manual-checkin-message");
const manualCheckinResultEl = document.getElementById("manual-checkin-result");
const toastContainerEl = document.getElementById("toast-container");

/* Nếu HTML của bạn dùng id khác thì sửa 2 dòng dưới cho khớp */
const searchInputEl = document.getElementById("search-input");
const checkinFilterEl = document.getElementById("checkin-filter");

let activeToastTimer = null;

let eventsData = [];
let currentRegistrations = [];
let currentTotalRegistrations = 0;
let currentEvent = null;
let currentEventId = "";
let currentSearchResult = null;
let activeResendRegistrationId = null;

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

function formatRegistrationCode(registrationId) {
  return `DK-${String(registrationId).padStart(4, "0")}`;
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

function showMessage(targetEl, message, type) {
  if (!targetEl) return;
  targetEl.textContent = message;
  targetEl.className = `form-message ${type}`;
}

function clearMessage(targetEl) {
  if (!targetEl) return;
  targetEl.textContent = "";
  targetEl.className = "form-message";
}

function showPageMessage(message, type) {
  showMessage(pageMessageEl, message, type);
}

function clearPageMessage() {
  clearMessage(pageMessageEl);
}

function showManualCheckinMessage(message, type) {
  showMessage(manualCheckinMessageEl, message, type);
}

function clearManualCheckinMessage() {
  clearMessage(manualCheckinMessageEl);
}

function showToast(message, type = "success") {
  if (!toastContainerEl) return;

  if (activeToastTimer) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }

  const toastEl = document.createElement("div");
  const title = type === "success" ? "Thành công" : "Thông báo";
  const icon = type === "success" ? "✓" : "!";
  toastEl.className = `toast ${type}`;
  toastEl.setAttribute("role", "status");
  toastEl.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <strong>${title}</strong>
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

function renderRegistrationStatusChip(registration) {
  if (registration.is_checked_in) {
    return '<span class="status-chip checked-in">Đã check-in</span>';
  }

  return '<span class="status-chip pending">Chưa check-in</span>';
}

function renderEmailDeliveryStatusChip(registration) {
  const status = registration.email_delivery_status || "Chờ gửi";
  const chipClass =
    status === "Đã gửi"
      ? "checked-in"
      : status === "Gửi thất bại"
        ? "failed"
        : "pending";

  return `<span class="status-chip ${chipClass}">${escapeHtml(status)}</span>`;
}

function renderResendEmailAction(registration) {
  const isSending = Number(activeResendRegistrationId) === Number(registration.id);
  const buttonLabel = isSending ? "Đang gửi..." : "Gửi lại email";
  const sentAtText = registration.email_sent_at ? formatDate(registration.email_sent_at) : "Chưa gửi thành công";
  const errorText = registration.email_error_message
    ? `<p class="action-meta error-text">${escapeHtml(registration.email_error_message)}</p>`
    : "";

  return `
    <div class="row-action-group">
      <button
        type="button"
        class="outline-btn row-action-btn"
        data-resend-registration-id="${registration.id}"
        ${isSending ? "disabled" : ""}
      >
        ${buttonLabel}
      </button>
      <p class="action-meta">Lần gửi thành công gần nhất: ${escapeHtml(sentAtText)}</p>
      ${errorText}
    </div>
  `;
}

function renderRegistrations(registrations) {
  registrationTableBodyEl.innerHTML = registrations
    .map(
      (registration, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(registration.registration_code || formatRegistrationCode(registration.id))}</td>
          <td>${escapeHtml(registration.full_name)}</td>
          <td>${escapeHtml(registration.student_id)}</td>
          <td>${escapeHtml(registration.email)}</td>
          <td>${escapeHtml(registration.phone || "-")}</td>
          <td>${renderRegistrationStatusChip(registration)}</td>
          <td>${renderEmailDeliveryStatusChip(registration)}</td>
          <td>${escapeHtml(registration.is_checked_in ? formatDate(registration.checked_in_at) : "Chưa check-in")}</td>
          <td>${formatDate(registration.created_at)}</td>
          <td>${renderResendEmailAction(registration)}</td>
        </tr>
      `
    )
    .join("");
}

function toggleListState(hasData) {
  emptyStateEl.classList.toggle("hidden", hasData);
  tableWrapperEl.classList.toggle("hidden", !hasData);
}

function updateRegistrationView() {
  if (!currentEvent) {
    registrationTableBodyEl.innerHTML = "";
    registrationStatusEl.textContent = "Chưa có sự kiện để xem danh sách đăng ký.";
    toggleListState(false);
    setHeroState({ status: "Chưa có dữ liệu" });
    return;
  }

  renderRegistrations(currentRegistrations);
  toggleListState(currentRegistrations.length > 0);

  const heroCount = Number(currentEvent.registration_count || currentTotalRegistrations || 0);
  setHeroState({
    eventTitle: currentEvent.title,
    count: heroCount,
    status: heroCount > 0 ? "Đã tải thành công" : "Danh sách trống"
  });

  if (currentTotalRegistrations === 0) {
    registrationStatusEl.textContent = "Sự kiện này chưa có người đăng ký.";
    return;
  }

  if (currentRegistrations.length === 0) {
    registrationStatusEl.textContent = "Không có người đăng ký phù hợp với bộ lọc hiện tại.";
    return;
  }

  registrationStatusEl.textContent = `Đang hiển thị ${currentRegistrations.length}/${currentTotalRegistrations} người đăng ký cho sự kiện đã chọn.`;
}

function clearManualCheckinResult() {
  currentSearchResult = null;
  manualCheckinResultEl.className = "manual-checkin-result hidden";
  manualCheckinResultEl.innerHTML = "";
}

function renderManualCheckinResult(registration) {
  currentSearchResult = registration;
  manualCheckinResultEl.className = "manual-checkin-result";

  const checkinStatusText = registration.is_checked_in ? "Đã check-in" : "Chưa check-in";
  const buttonLabel = registration.is_checked_in ? "Đã ghi nhận check-in" : "Xác nhận check-in thủ công";
  const buttonDisabled = registration.is_checked_in ? "disabled" : "";

  manualCheckinResultEl.innerHTML = `
    <div class="manual-result-header">
      <div>
        <p class="mini-label">Kết quả tìm kiếm</p>
        <h3>${escapeHtml(registration.full_name)}</h3>
      </div>
      ${renderRegistrationStatusChip(registration)}
    </div>
    <div class="manual-result-grid">
      <div>
        <span class="info-label">Mã đăng ký</span>
        <strong>${escapeHtml(registration.registration_code || formatRegistrationCode(registration.id))}</strong>
      </div>
      <div>
        <span class="info-label">MSSV</span>
        <strong>${escapeHtml(registration.student_id)}</strong>
      </div>
      <div>
        <span class="info-label">Email</span>
        <strong>${escapeHtml(registration.email)}</strong>
      </div>
      <div>
        <span class="info-label">Số điện thoại</span>
        <strong>${escapeHtml(registration.phone || "-")}</strong>
      </div>
      <div>
        <span class="info-label">Trạng thái tham dự</span>
        <strong>${escapeHtml(checkinStatusText)}</strong>
      </div>
      <div>
        <span class="info-label">Thời gian check-in</span>
        <strong>${escapeHtml(registration.is_checked_in ? formatDate(registration.checked_in_at) : "Chưa check-in")}</strong>
      </div>
    </div>
    <div class="manual-result-actions">
      <button type="button" class="primary-btn" id="manual-checkin-confirm-btn" ${buttonDisabled}>
        ${buttonLabel}
      </button>
      <button type="button" class="outline-btn" id="manual-checkin-clear-btn">Xóa kết quả</button>
    </div>
  `;

  const confirmButtonEl = document.getElementById("manual-checkin-confirm-btn");
  const clearButtonEl = document.getElementById("manual-checkin-clear-btn");

  if (confirmButtonEl) {
    confirmButtonEl.addEventListener("click", handleManualCheckinConfirm);
  }

  if (clearButtonEl) {
    clearButtonEl.addEventListener("click", () => {
      clearManualCheckinMessage();
      clearManualCheckinResult();
      if (manualCheckinKeywordEl) {
        manualCheckinKeywordEl.value = "";
        manualCheckinKeywordEl.focus();
      }
    });
  }
}

async function loadEvents() {
  const response = await fetch(`${API_BASE_URL}/events`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không tải được danh sách sự kiện");
  }

  return Array.isArray(result) ? result : [];
}

async function loadRegistrationsByEvent(eventId, searchQuery = "", checkin = "all") {
  const url = new URL(`${API_BASE_URL}/events/${eventId}/registrations`);
  if (searchQuery) {
    url.searchParams.set("q", searchQuery.trim());
  }
  if (checkin && checkin !== "all") {
    url.searchParams.set("checkin", checkin);
  }

  const response = await fetch(url.toString());
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không tải được danh sách người đăng ký");
  }

  return result;
}

async function searchRegistrationForManualCheckin(eventId, keyword) {
  const params = new URLSearchParams({ keyword });
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/registrations/search?${params.toString()}`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(result?.message || "Không thể tìm người đăng ký");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

async function submitManualCheckin(eventId, registrationId) {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/check-in/manual`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ registration_id: registrationId })
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(result?.message || "Không thể check-in thủ công");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

async function resendConfirmationEmail(eventId, registrationId) {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/registrations/${registrationId}/resend-confirmation-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(result?.message || "Không thể gửi lại email xác nhận");
    error.status = response.status;
    error.payload = result;
    throw error;
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

function syncRegistrationInCurrentList(updatedRegistration) {
  currentRegistrations = currentRegistrations.map((item) =>
    Number(item.id) === Number(updatedRegistration.id) ? { ...item, ...updatedRegistration } : item
  );
  updateRegistrationView();
}


function syncSearchResult(updatedRegistration) {
  if (!currentSearchResult || Number(currentSearchResult.id) !== Number(updatedRegistration.id)) {
    return;
  }

  currentSearchResult = { ...currentSearchResult, ...updatedRegistration };
  renderManualCheckinResult(currentSearchResult);
}

async function refreshCurrentEventRegistrations() {
  if (!currentEventId || !currentEvent) return;

  const result = await loadRegistrationsByEvent(
    currentEventId,
    String(searchInputEl?.value || ""),
    checkinFilterEl?.value || "all"
  );

  currentRegistrations = Array.isArray(result.registrations) ? result.registrations : [];
  currentTotalRegistrations = Number(result.totalRegistrations || 0);

  currentEvent.registration_count = currentTotalRegistrations;
  renderSelectedEventInfo(currentEvent);
  updateRegistrationView();
}

async function handleEventChange(eventId) {
  currentEventId = String(eventId || "");
  clearManualCheckinMessage();
  clearManualCheckinResult();

  const selectedEvent = eventsData.find((item) => String(item.id) === String(eventId));
  currentEvent = selectedEvent || null;

  if (!selectedEvent || !eventId) {
    renderSelectedEventInfo(null);
    registrationStatusEl.textContent = "Chưa có sự kiện để xem danh sách đăng ký.";
    registrationTableBodyEl.innerHTML = "";
    currentRegistrations = [];
    currentTotalRegistrations = 0;
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
    const result = await loadRegistrationsByEvent(
      eventId,
      String(searchInputEl?.value || ""),
      checkinFilterEl?.value || "all"
    );

    currentRegistrations = Array.isArray(result?.registrations)
      ? result.registrations
      : Array.isArray(result)
        ? result
        : [];
    currentTotalRegistrations = Number(
      result?.totalRegistrations ?? result?.total ?? currentRegistrations.length ?? 0
    );

    selectedEvent.registration_count = currentTotalRegistrations;
    currentEvent = selectedEvent;
    renderSelectedEventInfo(selectedEvent);
    updateRegistrationView();
    updateQueryString(eventId);
  } catch (error) {
    registrationTableBodyEl.innerHTML = "";
    currentRegistrations = [];
    currentTotalRegistrations = 0;
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

async function handleManualCheckinConfirm() {
  if (!currentEventId || !currentSearchResult) {
    return;
  }

  clearManualCheckinMessage();

  try {
    const result = await submitManualCheckin(currentEventId, currentSearchResult.id);
    const updatedRegistration = result.registration;
    syncRegistrationInCurrentList(updatedRegistration);
    renderManualCheckinResult(updatedRegistration);
    await refreshCurrentEventRegistrations();
    const successMessage = result.message || "Check-in thủ công thành công.";
    showManualCheckinMessage(successMessage, "success");
    showToast(successMessage, "success");
  } catch (error) {
    if (error.status === 409 && error.payload?.registration) {
      currentSearchResult = error.payload.registration;
      renderManualCheckinResult(error.payload.registration);
    }

    showManualCheckinMessage(error.message || "Không thể check-in thủ công.", "error");
    console.error(error);
  }
}


async function handleResendConfirmation(registrationId) {
  if (!currentEventId || !registrationId) {
    return;
  }

  clearPageMessage();
  activeResendRegistrationId = Number(registrationId);
  updateRegistrationView();

  try {
    const result = await resendConfirmationEmail(currentEventId, registrationId);
    if (result.registration) {
      syncRegistrationInCurrentList(result.registration);
      syncSearchResult(result.registration);
    }

    const successMessage = [result.message, result.warning].filter(Boolean).join(" ") || "Đã gửi lại email xác nhận thành công.";
    showPageMessage(successMessage, "success");
    showToast(successMessage, "success");

    try {
      await refreshCurrentEventRegistrations();
    } catch (refreshError) {
      const refreshWarning = "Email đã được gửi nhưng không thể tải lại danh sách mới nhất.";
      showToast(refreshWarning, "error");
      console.error(refreshError);
    }
  } catch (error) {
    if (error.payload?.registration) {
      syncRegistrationInCurrentList(error.payload.registration);
      syncSearchResult(error.payload.registration);
    }

    const errorMessage = error.payload?.message || error.message || "Không thể gửi lại email xác nhận.";
    showPageMessage(errorMessage, "error");
    showToast(errorMessage, "error");
    console.error(error);
  } finally {
    activeResendRegistrationId = null;
    updateRegistrationView();
  }
}

async function initializePage() {
  try {
    clearPageMessage();
    clearManualCheckinMessage();
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

if (searchInputEl) {
  searchInputEl.addEventListener("input", async () => {
    clearPageMessage();
    if (!currentEvent) return;
    await handleEventChange(currentEvent.id);
  });
}

if (checkinFilterEl) {
  checkinFilterEl.addEventListener("change", async () => {
    clearPageMessage();
    if (!currentEvent) return;
    await handleEventChange(currentEvent.id);
  });
}

if (manualCheckinFormEl) {
  manualCheckinFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearManualCheckinMessage();

    if (!currentEventId) {
      showManualCheckinMessage("Vui lòng chọn sự kiện trước khi check-in thủ công.", "error");
      return;
    }

    const keyword = manualCheckinKeywordEl.value.trim();

    if (!keyword) {
      showManualCheckinMessage("Vui lòng nhập mã đăng ký, email hoặc MSSV để tìm kiếm.", "error");
      clearManualCheckinResult();
      return;
    }

    try {
      const result = await searchRegistrationForManualCheckin(currentEventId, keyword);
      renderManualCheckinResult(result.registration);

      if (result.registration.is_checked_in) {
        showManualCheckinMessage(
          `Người tham gia này đã check-in lúc ${formatDate(result.registration.checked_in_at)}.`,
          "success"
        );
      } else {
        showManualCheckinMessage("Đã tìm thấy người đăng ký. Bạn có thể xác nhận check-in thủ công.", "success");
      }
    } catch (error) {
      clearManualCheckinResult();
      showManualCheckinMessage(error.message || "Không thể tìm người đăng ký.", "error");
      console.error(error);
    }
  });
}

initializePage();

if (registrationTableBodyEl) {
  registrationTableBodyEl.addEventListener("click", async (event) => {
    const resendButton = event.target.closest("[data-resend-registration-id]");
    if (!resendButton) return;

    await handleResendConfirmation(resendButton.dataset.resendRegistrationId);
  });
}
