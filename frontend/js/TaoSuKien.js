function getApiBaseUrl() {
  const isLocalBrowserHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isBackendOrigin = isLocalBrowserHost && window.location.port === "5000";

  if (window.location.protocol === "file:" || (isLocalBrowserHost && !isBackendOrigin)) {
    return "http://localhost:5000/api";
  }

  return `${window.location.origin}/api`;
}

const API_BASE_URL = getApiBaseUrl();
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

let editingEventId = null;
let currentEvents = [];
let registrationStateByEvent = {};

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
              <td>${registration.id}</td>
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
      const viewLabel = registrationState.expanded ? "Ẩn danh sách đăng ký" : "Xem danh sách đăng ký";

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
          <p><span class="label">Cập nhật lúc:</span> ${formatDate(event.updated_at)}</p>

          <div class="event-card-actions">
            <a class="register-link" href="./FormDangKy.html?eventId=${event.id}">
              Đăng ký tham gia
            </a>
            <button type="button" class="secondary-button view-registrations-button" data-event-id="${event.id}">
              ${viewLabel}
            </button>
            <button type="button" class="export-button" data-event-id="${event.id}">
              Xuất danh sách XLSX
            </button>
            <button type="button" class="delete-button" data-event-id="${event.id}">
              Xóa sự kiện
            </button>
          </div>

          ${renderRegistrationTable(event.id)}
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

      showFormMessage(
        isEditMode ? "Đang cập nhật sự kiện..." : "Đang tạo sự kiện...",
        "success"
      );

      await submitEvent({ title, event_time, location, description });

      setCreateMode();
      showFormMessage(
        isEditMode ? "Cập nhật sự kiện thành công." : "Tạo sự kiện thành công.",
        "success"
      );

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

      try {
        const selectedEvent = currentEvents.find((item) => item.id === eventId);

        if (!selectedEvent) {
          showFormMessage("Sự kiện không tồn tại trong hệ thống.", "error");
          return;
        }

        setEditMode(selectedEvent);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        showFormMessage("Không tải được dữ liệu sự kiện để chỉnh sửa.", "error");
        console.error(error);
      }
      return;
    }

    const deleteButton = event.target.closest(".delete-button");
    if (deleteButton) {
      const eventId = Number.parseInt(deleteButton.dataset.eventId, 10);
      if (!Number.isInteger(eventId)) {
        showFormMessage("Không xác định được sự kiện cần xóa.", "error");
        return;
      }

      try {
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
      } catch (error) {
        showFormMessage("Không tải được dữ liệu sự kiện để xóa.", "error");
        console.error(error);
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
            registrations: result.registrations || [],
            total: result.totalRegistrations ?? result.total ?? 0
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
}

setCreateMode();
loadEvents();