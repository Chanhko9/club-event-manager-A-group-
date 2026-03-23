<<<<<<< HEAD
const API_BASE_URL = "http://localhost:5000/api/events";

=======
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
const statusEl = document.getElementById("status");
const eventListEl = document.getElementById("event-list");
const eventFormEl = document.getElementById("event-form");
const formMessageEl = document.getElementById("form-message");
const submitBtnEl = document.getElementById("submit-btn");
<<<<<<< HEAD
const cancelBtnEl = document.getElementById("cancel-btn");
const formTitleEl = document.getElementById("form-title");
const eventIdEl = document.getElementById("event-id");
const titleEl = document.getElementById("title");
const eventTimeEl = document.getElementById("event_time");
const locationEl = document.getElementById("location");
const descriptionEl = document.getElementById("description");

let editingEventId = null;
=======
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function formatDateTimeForMySQL(datetimeLocalValue) {
  if (!datetimeLocalValue) return "";
  return `${datetimeLocalValue.replace("T", " ")}:00`;
}

<<<<<<< HEAD
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

=======
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
function showFormMessage(message, type) {
  formMessageEl.textContent = message;
  formMessageEl.className = `form-message ${type}`;
}

<<<<<<< HEAD
function clearFormMessage() {
  formMessageEl.textContent = "";
  formMessageEl.className = "form-message";
}

function setCreateMode() {
  editingEventId = null;
  eventIdEl.value = "";
  formTitleEl.textContent = "Tạo sự kiện mới";
  submitBtnEl.textContent = "Tạo sự kiện";
  cancelBtnEl.classList.add("hidden");
  eventFormEl.reset();
}

function setEditMode(event) {
  editingEventId = event.id;
  eventIdEl.value = event.id;
  formTitleEl.textContent = `Chỉnh sửa sự kiện #${event.id}`;
  submitBtnEl.textContent = "Lưu cập nhật";
  cancelBtnEl.classList.remove("hidden");

  titleEl.value = event.title || "";
  eventTimeEl.value = formatDateTimeForInput(event.event_time);
  locationEl.value = event.location || "";
  descriptionEl.value = event.description || "";
  showFormMessage(`Đang chỉnh sửa sự kiện: ${event.title}`, "success");
  titleEl.focus();
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

=======
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
function renderEvents(events) {
  if (!events.length) {
    statusEl.textContent = "Chưa có sự kiện nào.";
    eventListEl.innerHTML = "";
    return;
  }

  statusEl.textContent = `Đã tải ${events.length} sự kiện.`;

  eventListEl.innerHTML = events
    .map(
      (event) => `
        <div class="event-card">
<<<<<<< HEAD
          <div class="event-card-header">
            <h3>${escapeHtml(event.title)}</h3>
            <button type="button" class="edit-button" data-event-id="${event.id}">Chỉnh sửa</button>
          </div>
          <p><span class="label">Mã sự kiện:</span> #${event.id}</p>
          <p><span class="label">Thời gian:</span> ${formatDate(event.event_time)}</p>
          <p><span class="label">Địa điểm:</span> ${escapeHtml(event.location)}</p>
          <p><span class="label">Mô tả:</span> ${escapeHtml(event.description || "Không có mô tả")}</p>
          <p><span class="label">Cập nhật lúc:</span> ${formatDate(event.updated_at)}</p>
=======
          <h3>${event.title}</h3>
          <p><span class="label">Thời gian:</span> ${formatDate(event.event_time)}</p>
          <p><span class="label">Địa điểm:</span> ${event.location}</p>
          <p><span class="label">Mô tả:</span> ${event.description || "Không có mô tả"}</p>
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
        </div>
      `
    )
    .join("");
}

async function loadEvents() {
  try {
    statusEl.textContent = "Đang tải dữ liệu...";

<<<<<<< HEAD
    const response = await fetch(API_BASE_URL);
=======
    const response = await fetch("http://localhost:5000/api/events");
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
    if (!response.ok) {
      throw new Error("Không lấy được dữ liệu từ server");
    }

    const events = await response.json();
    renderEvents(events);
<<<<<<< HEAD
    return events;
  } catch (error) {
    statusEl.textContent = "Tải dữ liệu thất bại.";
    eventListEl.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    console.error(error);
    return [];
  }
}

async function submitEvent(payload) {
  const isEditMode = Boolean(editingEventId);
  const url = isEditMode ? `${API_BASE_URL}/${editingEventId}` : API_BASE_URL;
  const method = isEditMode ? "PUT" : "POST";

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || (isEditMode ? "Cập nhật sự kiện thất bại" : "Tạo sự kiện thất bại"));
  }

  return result;
}

eventFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = titleEl.value.trim();
  const eventTimeInput = eventTimeEl.value;
  const location = locationEl.value.trim();
  const description = descriptionEl.value.trim();

  const validationError = validateForm({ title, eventTimeInput, location });
  if (validationError) {
    showFormMessage(validationError, "error");
=======
  } catch (error) {
    statusEl.textContent = "Tải dữ liệu thất bại.";
    eventListEl.innerHTML = `<p>${error.message}</p>`;
    console.error(error);
  }
}

eventFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value.trim();
  const eventTimeInput = document.getElementById("event_time").value;
  const location = document.getElementById("location").value.trim();
  const description = document.getElementById("description").value.trim();

  if (!title || !eventTimeInput || !location) {
    showFormMessage("Vui lòng nhập đầy đủ các trường bắt buộc.", "error");
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
    return;
  }

  const event_time = formatDateTimeForMySQL(eventTimeInput);
<<<<<<< HEAD
  const isEditMode = Boolean(editingEventId);

  try {
    submitBtnEl.disabled = true;
    cancelBtnEl.disabled = true;
    showFormMessage(isEditMode ? "Đang cập nhật sự kiện..." : "Đang tạo sự kiện...", "success");

    await submitEvent({
      title,
      event_time,
      location,
      description
    });

    setCreateMode();
    showFormMessage(isEditMode ? "Cập nhật sự kiện thành công." : "Tạo sự kiện thành công.", "success");
=======

  try {
    submitBtnEl.disabled = true;
    showFormMessage("Đang tạo sự kiện...", "success");

    const response = await fetch("http://localhost:5000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        event_time,
        location,
        description
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Tạo sự kiện thất bại");
    }

    showFormMessage("Tạo sự kiện thành công.", "success");
    eventFormEl.reset();
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
    await loadEvents();
  } catch (error) {
    showFormMessage(error.message, "error");
    console.error(error);
  } finally {
    submitBtnEl.disabled = false;
<<<<<<< HEAD
    cancelBtnEl.disabled = false;
  }
});

cancelBtnEl.addEventListener("click", () => {
  setCreateMode();
  clearFormMessage();
});

eventListEl.addEventListener("click", async (event) => {
  const editButton = event.target.closest(".edit-button");
  if (!editButton) return;

  const eventId = Number.parseInt(editButton.dataset.eventId, 10);
  if (!Number.isInteger(eventId)) {
    showFormMessage("Không xác định được sự kiện cần chỉnh sửa.", "error");
    return;
  }

  try {
    const events = await loadEvents();
    const selectedEvent = events.find((item) => item.id === eventId);

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
});

setCreateMode();
loadEvents();
=======
  }
});

loadEvents();
>>>>>>> 0ecf83c667f318e6897dd2b48d7aff812c3a87a4
