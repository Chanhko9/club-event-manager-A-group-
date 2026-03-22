const statusEl = document.getElementById("status");
const eventListEl = document.getElementById("event-list");
const eventFormEl = document.getElementById("event-form");
const formMessageEl = document.getElementById("form-message");
const submitBtnEl = document.getElementById("submit-btn");

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function formatDateTimeForMySQL(datetimeLocalValue) {
  if (!datetimeLocalValue) return "";
  return `${datetimeLocalValue.replace("T", " ")}:00`;
}

function showFormMessage(message, type) {
  formMessageEl.textContent = message;
  formMessageEl.className = `form-message ${type}`;
}

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
          <h3>${event.title}</h3>
          <p><span class="label">Thời gian:</span> ${formatDate(event.event_time)}</p>
          <p><span class="label">Địa điểm:</span> ${event.location}</p>
          <p><span class="label">Mô tả:</span> ${event.description || "Không có mô tả"}</p>
        </div>
      `
    )
    .join("");
}

async function loadEvents() {
  try {
    statusEl.textContent = "Đang tải dữ liệu...";

    const response = await fetch("http://localhost:5000/api/events");
    if (!response.ok) {
      throw new Error("Không lấy được dữ liệu từ server");
    }

    const events = await response.json();
    renderEvents(events);
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
    return;
  }

  const event_time = formatDateTimeForMySQL(eventTimeInput);

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
    await loadEvents();
  } catch (error) {
    showFormMessage(error.message, "error");
    console.error(error);
  } finally {
    submitBtnEl.disabled = false;
  }
});

loadEvents();