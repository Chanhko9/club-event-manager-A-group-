const API_BASE_URL = window.AppConfig.API_BASE_URL;
const API_EVENTS_URL = `${API_BASE_URL}/events`;

const statusEl = document.getElementById("status");
const eventListEl = document.getElementById("event-list");
const eventFormEl = document.getElementById("event-form");
const formMessageEl = document.getElementById("form-message");
const submitBtnEl = document.getElementById("submit-btn");
const cancelBtnEl = document.getElementById("cancel-btn");
const formTitleEl = document.getElementById("form-title");
const eventIdEl = document.getElementById("event-id");
const titleEl = document.getElementById("title");
const eventTimeEl = document.getElementById("event_time");
const locationEl = document.getElementById("location");
const descriptionEl = document.getElementById("description");
const adminSessionBadgeEl = document.getElementById("admin-session-badge");
const adminLogoutBtnEl = document.getElementById("admin-logout-btn");

let editingEventId = null;
let currentEvents = [];
let registrationStateByEvent = {};
let feedbackStateByEvent = {};


function renderAdminSession(admin) {
  if (!adminSessionBadgeEl) return;
  const displayName = admin?.full_name || admin?.username || 'admin';
  const roleText = admin?.role ? ` (${admin.role})` : '';
  adminSessionBadgeEl.textContent = `Admin: ${displayName}${roleText}`;
}

async function initializeAdminPage() {
  try {
    const session = await window.AdminAuth.ensureAdminSession();
    renderAdminSession(session.admin);

    adminLogoutBtnEl?.addEventListener("click", async () => {
      await window.AdminAuth.logoutAdmin();
    });

    setCreateMode();
    await loadEvents();
  } catch (error) {
    console.error(error);
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function formatDateTimeForMySQL(datetimeLocalValue) {
  if (!datetimeLocalValue) return "";
  return `${datetimeLocalValue.replace("T", " ")}:00`;
}

function formatDateTimeForInput(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
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

function showFormMessage(message, type) {
  if (!formMessageEl) return;
  formMessageEl.textContent = message;
  formMessageEl.className = `form-message ${type}`;
}

function clearFormMessage() {
  if (!formMessageEl) return;
  formMessageEl.textContent = "";
  formMessageEl.className = "form-message";
}

function setCreateMode() {
  editingEventId = null;

  if (eventIdEl) eventIdEl.value = "";
  if (formTitleEl) formTitleEl.textContent = "Tạo sự kiện mới";
  if (submitBtnEl) submitBtnEl.textContent = "Tạo sự kiện";
  if (cancelBtnEl) cancelBtnEl.classList.add("hidden");

  if (eventFormEl) eventFormEl.reset();
}

function setEditMode(event) {
  editingEventId = event.id;

  if (eventIdEl) eventIdEl.value = event.id;
  if (formTitleEl) formTitleEl.textContent = `Chỉnh sửa sự kiện #${event.id}`;
  if (submitBtnEl) submitBtnEl.textContent = "Lưu cập nhật";
  if (cancelBtnEl) cancelBtnEl.classList.remove("hidden");

  if (titleEl) titleEl.value = event.title || "";
  if (eventTimeEl) eventTimeEl.value = formatDateTimeForInput(event.event_time);
  if (locationEl) locationEl.value = event.location || "";
  if (descriptionEl) descriptionEl.value = event.description || "";

  showFormMessage(`Đang chỉnh sửa sự kiện: ${event.title}`, "success");
  if (titleEl) titleEl.focus();
}

function validateForm({ title, eventTimeInput, location }) {
  if (!title || !eventTimeInput || !location) {
    return "Vui lòng nhập đầy đủ các trường bắt buộc.";
  }

  const parsedDate = new Date(eventTimeInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Thời gian sự kiện không hợp lệ.";
  }

  return "";
}

function getRegistrationState(eventId) {
  return registrationStateByEvent[eventId] || {
    expanded: false,
    loading: false,
    loaded: false,
    error: "",
    registrations: [],
    total: 0
  };
}

function getFeedbackState(eventId) {
  return (
    feedbackStateByEvent[eventId] || {
      expanded: false,
      loading: false,
      loaded: false,
      saving: false,
      sendingInvitation: false,
      error: "",
      form: null,
      responses: []
    }
  );
}

function renderRegistrationTable(eventId) {
  const state = getRegistrationState(eventId);

  if (!state.expanded) {
    return "";
  }

  if (state.loading) {
    return `
      <div class="registration-panel">
        <p class="registration-hint">Đang tải danh sách đăng ký...</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="registration-panel">
        <p class="registration-error">${escapeHtml(state.error)}</p>
      </div>
    `;
  }

  const rowsHtml = state.registrations.length
    ? state.registrations
        .map(
          (registration, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(registration.registration_code || registration.id)}</td>
              <td>${escapeHtml(registration.full_name)}</td>
              <td>${escapeHtml(registration.student_id)}</td>
              <td>${escapeHtml(registration.email)}</td>
              <td>${escapeHtml(registration.phone || "")}</td>
              <td>${formatDate(registration.created_at)}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="7" class="empty-cell">Chưa có người đăng ký cho sự kiện này.</td>
      </tr>
    `;

  return `
    <div class="registration-panel">
      <div class="registration-panel-header">
        <strong>Danh sách đăng ký</strong>
        <span>Tổng cộng: ${state.total}</span>
      </div>
      <div class="table-wrapper">
        <table class="registration-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã ĐK</th>
              <th>Họ tên</th>
              <th>MSSV</th>
              <th>Email</th>
              <th>Số điện thoại</th>
              <th>Thời gian đăng ký</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderFeedbackResponses(responses) {
  if (!responses.length) {
    return `<p class="feedback-empty">Chưa có phản hồi nào cho sự kiện này.</p>`;
  }

  return `
    <div class="table-wrapper">
      <table class="registration-table feedback-response-table">
        <thead>
          <tr>
            <th>Người gửi</th>
            <th>MSSV</th>
            <th>Đánh giá</th>
            <th>Góp ý</th>
            <th>Thời gian</th>
          </tr>
        </thead>
        <tbody>
          ${responses
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(item.full_name)}</td>
                  <td>${escapeHtml(item.student_id)}</td>
                  <td>${"★".repeat(Number(item.satisfaction_rating || 0))}</td>
                  <td>${escapeHtml(item.comment || "Không có góp ý")}</td>
                  <td>${formatDate(item.created_at)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFeedbackPanel(event) {
  const state = getFeedbackState(event.id);

  if (!state.expanded) {
    return "";
  }

  if (state.loading) {
    return `
      <div class="feedback-panel">
        <p class="registration-hint">Đang tải cấu hình feedback...</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="feedback-panel">
        <p class="registration-error">${escapeHtml(state.error)}</p>
      </div>
    `;
  }

  const form = state.form || {
    is_enabled: false,
    satisfaction_question: "Mức độ hài lòng của bạn về sự kiện là gì?",
    comment_question: "Bạn có góp ý gì để sự kiện sau tốt hơn không?",
    success_message: "Cảm ơn bạn đã gửi phản hồi cho ban tổ chức.",
    response_count: 0
  };

  const averageRating = state.responses.length
    ? (
        state.responses.reduce((total, item) => total + Number(item.satisfaction_rating || 0), 0) /
        state.responses.length
      ).toFixed(1)
    : "0.0";

  return `
    <div class="feedback-panel">
      <div class="feedback-panel-header">
        <div>
          <h4>Cấu hình feedback cho sự kiện</h4>
          <p>Admin có thể tạo form feedback riêng, bật/tắt nhận phản hồi, gửi link feedback qua email và xem góp ý đã gửi.</p>
        </div>
        <a class="register-link feedback-link" href="./FeedbackSuKien.html?eventId=${event.id}">
          Mở form feedback
        </a>
      </div>

      <form class="feedback-config-form" data-event-id="${event.id}">
        <label class="feedback-toggle">
          <input type="checkbox" name="is_enabled" ${form.is_enabled ? "checked" : ""} />
          <span>${form.is_enabled ? "Đang mở nhận feedback" : "Đang tắt nhận feedback"}</span>
        </label>

        <div class="form-group">
          <label>Câu hỏi mức độ hài lòng</label>
          <input
            type="text"
            name="satisfaction_question"
            value="${escapeHtml(form.satisfaction_question)}"
            placeholder="Ví dụ: Mức độ hài lòng của bạn về sự kiện là gì?"
          />
        </div>

        <div class="form-group">
          <label>Câu hỏi góp ý</label>
          <textarea
            name="comment_question"
            rows="3"
            placeholder="Ví dụ: Bạn có góp ý gì để sự kiện sau tốt hơn không?"
          >${escapeHtml(form.comment_question)}</textarea>
        </div>

        <div class="form-group">
          <label>Thông điệp sau khi gửi</label>
          <textarea
            name="success_message"
            rows="2"
            placeholder="Ví dụ: Cảm ơn bạn đã gửi phản hồi cho ban tổ chức."
          >${escapeHtml(form.success_message)}</textarea>
        </div>

        <div class="feedback-config-actions">
          <button type="submit" class="save-feedback-button" data-event-id="${event.id}" ${
            state.saving ? "disabled" : ""
          }>
            ${state.saving ? "Đang lưu..." : "Lưu cấu hình feedback"}
          </button>
          <button
            type="button"
            class="secondary-button send-feedback-link-button"
            data-event-id="${event.id}"
            ${state.sendingInvitation || !form.is_enabled || Number(event.registration_count || 0) === 0 ? "disabled" : ""}
          >
            ${state.sendingInvitation ? "Đang gửi email..." : "Gửi link feedback qua email"}
          </button>
        </div>
        <p class="feedback-helper-text">
          ${!form.is_enabled
            ? "Hãy bật form feedback trước khi gửi email cho người tham gia."
            : Number(event.registration_count || 0) === 0
              ? "Sự kiện chưa có người đăng ký để gửi link feedback."
              : `Hệ thống sẽ gửi link feedback cho ${Number(event.registration_count || 0)} người đăng ký của sự kiện.`}
        </p>
      </form>

      <div class="feedback-summary-grid">
        <div class="feedback-summary-card">
          <span>Tình trạng</span>
          <strong>${form.is_enabled ? "Đang mở" : "Đang tắt"}</strong>
        </div>
        <div class="feedback-summary-card">
          <span>Số phản hồi</span>
          <strong>${Number(form.response_count || state.responses.length || 0)}</strong>
        </div>
        <div class="feedback-summary-card">
          <span>Điểm hài lòng trung bình</span>
          <strong>${averageRating}/5</strong>
        </div>
      </div>

      <div class="feedback-response-section">
        <h5>Phản hồi đã nhận</h5>
        ${renderFeedbackResponses(state.responses)}
      </div>
    </div>
  `;
}

function renderEvents(events) {
  if (!statusEl || !eventListEl) return;

  if (!events.length) {
    statusEl.textContent = "Chưa có sự kiện nào.";
    eventListEl.innerHTML = "";
    return;
  }

  statusEl.textContent = `Đã tải ${events.length} sự kiện.`;

  eventListEl.innerHTML = events
    .map((event) => {
      const registrationState = getRegistrationState(event.id);
      const feedbackState = getFeedbackState(event.id);
      const viewLabel = registrationState.expanded ? "Ẩn danh sách đăng ký" : "Xem danh sách đăng ký";
      const feedbackLabel = feedbackState.expanded ? "Ẩn cấu hình feedback" : "Cấu hình feedback";

      return `
        <div class="event-card">
          <div class="event-card-header">
            <h3>${escapeHtml(event.title)}</h3>
            <button type="button" class="edit-button" data-event-id="${event.id}">
              Chỉnh sửa
            </button>
          </div>

          <p><span class="label">Mã sự kiện:</span> #${event.id}</p>
          <p><span class="label">Thời gian:</span> ${formatDate(event.event_time)}</p>
          <p><span class="label">Địa điểm:</span> ${escapeHtml(event.location)}</p>
          <p><span class="label">Mô tả:</span> ${escapeHtml(event.description || "Không có mô tả")}</p>
          <p><span class="label">Số người đăng ký:</span> ${Number(event.registration_count || 0)} người</p>
          <p><span class="label">Feedback:</span> ${event.feedback_enabled ? "Đang mở nhận phản hồi" : "Chưa mở"} - ${Number(event.feedback_response_count || 0)} phản hồi</p>
          <p><span class="label">Cập nhật lúc:</span> ${formatDate(event.updated_at)}</p>

          <div class="event-card-actions">
            <a class="register-link" href="./FormDangKy.html?eventId=${event.id}">
              Đăng ký tham gia
            </a>
            <a class="register-link secondary-link" href="./DanhSachDangKy.html?eventId=${event.id}">
              Check-in thủ công
            </a>
            <a class="register-link feedback-link" href="./FeedbackSuKien.html?eventId=${event.id}">
              Form feedback
            </a>
            <button type="button" class="secondary-button view-registrations-button" data-event-id="${event.id}">
              ${viewLabel}
            </button>
            <button type="button" class="feedback-button" data-event-id="${event.id}">
              ${feedbackLabel}
            </button>
            <button type="button" class="export-button" data-event-id="${event.id}">
              Xuất danh sách XLSX
            </button>
            <button type="button" class="delete-button" data-event-id="${event.id}">
              Xóa sự kiện
            </button>
          </div>

          ${renderRegistrationTable(event.id)}
          ${renderFeedbackPanel(event)}
        </div>
      `;
    })
    .join("");
}

async function loadEvents() {
  try {
    if (statusEl) statusEl.textContent = "Đang tải dữ liệu...";

    const response = await fetch(API_EVENTS_URL);
    const result = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(result?.message || "Không lấy được dữ liệu từ server");
    }

    const events = Array.isArray(result) ? result : [];
    currentEvents = events;
    renderEvents(events);
    return events;
  } catch (error) {
    if (statusEl) statusEl.textContent = "Tải dữ liệu thất bại.";
    if (eventListEl) {
      eventListEl.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
    console.error(error);
    return [];
  }
}

async function submitEvent(payload) {
  const isEditMode = Boolean(editingEventId);
  const url = isEditMode ? `${API_EVENTS_URL}/${editingEventId}` : API_EVENTS_URL;
  const method = isEditMode ? "PUT" : "POST";

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || (isEditMode ? "Cập nhật sự kiện thất bại" : "Tạo sự kiện thất bại"));
  }

  return result;
}

async function deleteEvent(eventId) {
  const response = await fetch(`${API_EVENTS_URL}/${eventId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" }
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Xóa sự kiện thất bại");
  }

  return result;
}

async function loadRegistrations(eventId) {
  const response = await fetch(`${API_EVENTS_URL}/${eventId}/registrations`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không thể lấy danh sách đăng ký");
  }

  return result || {};
}

async function loadFeedbackConfig(eventId) {
  const response = await fetch(`${API_EVENTS_URL}/${eventId}/feedback-form`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không thể tải cấu hình feedback");
  }

  return result || {};
}

async function saveFeedbackConfig(eventId, payload) {
  const response = await fetch(`${API_EVENTS_URL}/${eventId}/feedback-form`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không thể lưu cấu hình feedback");
  }

  return result || {};
}

async function sendFeedbackLinks(eventId) {
  const response = await fetch(`${API_EVENTS_URL}/${eventId}/send-feedback-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không thể gửi link feedback qua email");
  }

  return result || {};
}

function getFileNameFromDisposition(dispositionHeader) {
  if (!dispositionHeader) return "danh-sach-dang-ky.xlsx";

  const utf8Match = dispositionHeader.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = dispositionHeader.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || "danh-sach-dang-ky.xlsx";
}

async function exportRegistrations(eventId) {
  const response = await fetch(`${API_EVENTS_URL}/${eventId}/registrations/export`);

  if (!response.ok) {
    let errorMessage = "Xuất file thất bại";

    try {
      const result = await response.json();
      errorMessage = result.message || errorMessage;
    } catch (error) {
      console.error(error);
    }

    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const fileName = getFileNameFromDisposition(response.headers.get("Content-Disposition"));
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(downloadUrl);

  return fileName;
}

if (eventFormEl) {
  eventFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = titleEl.value.trim();
    const eventTimeInput = eventTimeEl.value;
    const location = locationEl.value.trim();
    const description = descriptionEl.value.trim();

    const validationError = validateForm({ title, eventTimeInput, location });
    if (validationError) {
      showFormMessage(validationError, "error");
      return;
    }

    const event_time = formatDateTimeForMySQL(eventTimeInput);
    const isEditMode = Boolean(editingEventId);

    try {
      if (submitBtnEl) submitBtnEl.disabled = true;
      if (cancelBtnEl) cancelBtnEl.disabled = true;

      showFormMessage(isEditMode ? "Đang cập nhật sự kiện..." : "Đang tạo sự kiện...", "success");

      await submitEvent({ title, event_time, location, description });

      setCreateMode();
      showFormMessage(isEditMode ? "Cập nhật sự kiện thành công." : "Tạo sự kiện thành công.", "success");

      await loadEvents();
    } catch (error) {
      showFormMessage(error.message, "error");
      console.error(error);
    } finally {
      if (submitBtnEl) submitBtnEl.disabled = false;
      if (cancelBtnEl) cancelBtnEl.disabled = false;
    }
  });
}

if (cancelBtnEl) {
  cancelBtnEl.addEventListener("click", () => {
    setCreateMode();
    clearFormMessage();
  });
}

if (eventListEl) {
  eventListEl.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-button");
    if (editButton) {
      const eventId = Number.parseInt(editButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần chỉnh sửa.", "error");
        return;
      }

      const selectedEvent = currentEvents.find((item) => item.id === eventId);
      if (!selectedEvent) {
        showFormMessage("Sự kiện không tồn tại trong hệ thống.", "error");
        return;
      }

      setEditMode(selectedEvent);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const deleteButton = event.target.closest(".delete-button");
    if (deleteButton) {
      const eventId = Number.parseInt(deleteButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần xóa.", "error");
        return;
      }

      const selectedEvent = currentEvents.find((item) => item.id === eventId);
      if (!selectedEvent) {
        showFormMessage("Sự kiện không tồn tại trong hệ thống.", "error");
        return;
      }

      const confirmMessage = `Bạn chắc chắn muốn xóa sự kiện "${selectedEvent.title}" không? Hành động này không thể hoàn tác.`;
      if (!window.confirm(confirmMessage)) {
        return;
      }

      try {
        deleteButton.disabled = true;
        showFormMessage("Đang xóa sự kiện...", "success");

        await deleteEvent(eventId);

        showFormMessage(`Xóa sự kiện "${selectedEvent.title}" thành công.`, "success");
        await loadEvents();
      } catch (error) {
        showFormMessage(error.message || "Xóa sự kiện thất bại.", "error");
        console.error(error);
      } finally {
        deleteButton.disabled = false;
      }
      return;
    }

    const viewButton = event.target.closest(".view-registrations-button");
    if (viewButton) {
      const eventId = Number.parseInt(viewButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần xem đăng ký.", "error");
        return;
      }

      const currentState = getRegistrationState(eventId);
      registrationStateByEvent[eventId] = {
        ...currentState,
        expanded: !currentState.expanded,
        error: currentState.expanded ? "" : currentState.error
      };
      renderEvents(currentEvents);

      if (!currentState.expanded && !currentState.loaded) {
        try {
          registrationStateByEvent[eventId] = {
            ...getRegistrationState(eventId),
            expanded: true,
            loading: true,
            error: ""
          };
          renderEvents(currentEvents);

          const result = await loadRegistrations(eventId);
          registrationStateByEvent[eventId] = {
            expanded: true,
            loading: false,
            loaded: true,
            error: "",
            registrations: Array.isArray(result?.registrations) ? result.registrations : [],
            total: Number(result?.totalRegistrations ?? result?.total ?? 0)
          };
          renderEvents(currentEvents);
          showFormMessage(`Đã tải danh sách đăng ký của sự kiện #${eventId}.`, "success");
        } catch (error) {
          registrationStateByEvent[eventId] = {
            expanded: true,
            loading: false,
            loaded: false,
            error: error.message || "Không thể lấy danh sách đăng ký.",
            registrations: [],
            total: 0
          };
          renderEvents(currentEvents);
          showFormMessage(error.message || "Không thể lấy danh sách đăng ký.", "error");
          console.error(error);
        }
      }
      return;
    }

    const feedbackButton = event.target.closest(".feedback-button");
    if (feedbackButton) {
      const eventId = Number.parseInt(feedbackButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần cấu hình feedback.", "error");
        return;
      }

      const currentState = getFeedbackState(eventId);
      feedbackStateByEvent[eventId] = {
        ...currentState,
        expanded: !currentState.expanded,
        error: currentState.expanded ? "" : currentState.error
      };
      renderEvents(currentEvents);

      if (!currentState.expanded && !currentState.loaded) {
        try {
          feedbackStateByEvent[eventId] = {
            ...getFeedbackState(eventId),
            expanded: true,
            loading: true,
            error: ""
          };
          renderEvents(currentEvents);

          const result = await loadFeedbackConfig(eventId);
          feedbackStateByEvent[eventId] = {
            expanded: true,
            loading: false,
            loaded: true,
            saving: false,
            error: "",
            form: result.feedbackForm || null,
            responses: Array.isArray(result.feedbackResponses) ? result.feedbackResponses : []
          };
          renderEvents(currentEvents);
        } catch (error) {
          feedbackStateByEvent[eventId] = {
            expanded: true,
            loading: false,
            loaded: false,
            saving: false,
            error: error.message || "Không thể tải cấu hình feedback.",
            form: null,
            responses: []
          };
          renderEvents(currentEvents);
          showFormMessage(error.message || "Không thể tải cấu hình feedback.", "error");
          console.error(error);
        }
      }
      return;
    }

    const sendFeedbackLinkButton = event.target.closest(".send-feedback-link-button");
    if (sendFeedbackLinkButton) {
      const eventId = Number.parseInt(sendFeedbackLinkButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần gửi link feedback.", "error");
        return;
      }

      try {
        feedbackStateByEvent[eventId] = {
          ...getFeedbackState(eventId),
          expanded: true,
          sendingInvitation: true,
          error: ""
        };
        renderEvents(currentEvents);

        const result = await sendFeedbackLinks(eventId);
        showFormMessage(result.message || "Đã gửi link feedback qua email.", result.failedCount ? "error" : "success");
      } catch (error) {
        showFormMessage(error.message || "Không thể gửi link feedback qua email.", "error");
        console.error(error);
      } finally {
        feedbackStateByEvent[eventId] = {
          ...getFeedbackState(eventId),
          expanded: true,
          sendingInvitation: false
        };
        renderEvents(currentEvents);
      }
      return;
    }

    const exportButton = event.target.closest(".export-button");
    if (exportButton) {
      const eventId = Number.parseInt(exportButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần xuất danh sách.", "error");
        return;
      }

      try {
        exportButton.disabled = true;
        showFormMessage("Hệ thống đang xuất file XLSX...", "success");
        const fileName = await exportRegistrations(eventId);
        showFormMessage(`Xuất file thành công: ${fileName}`, "success");
      } catch (error) {
        showFormMessage(error.message || "Xuất file thất bại.", "error");
        console.error(error);
      } finally {
        exportButton.disabled = false;
      }
    }
  });

  eventListEl.addEventListener("submit", async (event) => {
    const configForm = event.target.closest(".feedback-config-form");
    if (!configForm) {
      return;
    }

    event.preventDefault();
    const eventId = Number.parseInt(configForm.dataset.eventId, 10);
    if (!Number.isInteger(eventId)) {
      showFormMessage("Không xác định được sự kiện cần lưu feedback.", "error");
      return;
    }

    const formData = new FormData(configForm);
    const payload = {
      satisfaction_question: formData.get("satisfaction_question"),
      comment_question: formData.get("comment_question"),
      success_message: formData.get("success_message"),
      is_enabled: configForm.querySelector('input[name="is_enabled"]')?.checked || false
    };

    try {
      feedbackStateByEvent[eventId] = {
        ...getFeedbackState(eventId),
        expanded: true,
        saving: true,
        error: ""
      };
      renderEvents(currentEvents);

      const result = await saveFeedbackConfig(eventId, payload);
      feedbackStateByEvent[eventId] = {
        ...getFeedbackState(eventId),
        expanded: true,
        loaded: true,
        loading: false,
        saving: false,
        error: "",
        form: result.feedbackForm || payload
      };

      currentEvents = currentEvents.map((item) =>
        item.id === eventId
          ? {
              ...item,
              feedback_enabled: Boolean(result.feedbackForm?.is_enabled),
              feedback_response_count: Number(result.feedbackForm?.response_count || item.feedback_response_count || 0)
            }
          : item
      );

      renderEvents(currentEvents);
      showFormMessage(result.message || "Đã lưu cấu hình feedback.", "success");
    } catch (error) {
      feedbackStateByEvent[eventId] = {
        ...getFeedbackState(eventId),
        expanded: true,
        saving: false,
        error: error.message || "Không thể lưu cấu hình feedback."
      };
      renderEvents(currentEvents);
      showFormMessage(error.message || "Không thể lưu cấu hình feedback.", "error");
      console.error(error);
    }
  });

  eventListEl.addEventListener("change", (event) => {
    const toggle = event.target.closest('.feedback-config-form input[name="is_enabled"]');
    if (!toggle) {
      return;
    }

    const label = toggle.closest(".feedback-toggle")?.querySelector("span");
    if (label) {
      label.textContent = toggle.checked ? "Đang mở nhận feedback" : "Đang tắt nhận feedback";
    }
  });
}

initializeAdminPage();
