const statusEl = document.getElementById("status");
const eventListEl = document.getElementById("event-list");

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function renderEvents(events) {
  if (!events.length) {
    statusEl.textContent = "Chưa có sự kiện nào.";
    return;
  }

  statusEl.textContent = `Đã tải ${events.length} sự kiện.`;

  eventListEl.innerHTML = events
    .map(
      (event) => `
        <div class="event-card">
          <h2>${event.title}</h2>
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

loadEvents();