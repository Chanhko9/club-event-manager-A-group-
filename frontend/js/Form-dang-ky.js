const eventSelectEl = document.getElementById("event_id");
const selectedEventInfoEl = document.getElementById("selected-event-info");

let eventsData = [];

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN");
}

function getEventIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("eventId");
}

function renderSelectedEventInfo(eventId) {
  const event = eventsData.find((item) => String(item.id) === String(eventId));

  if (!event) {
    selectedEventInfoEl.innerHTML = "";
    return;
  }

  selectedEventInfoEl.innerHTML = `
    <div class="event-preview-card">
      <h3>${event.title}</h3>
      <p><strong>Thời gian:</strong> ${formatDate(event.event_time)}</p>
      <p><strong>Địa điểm:</strong> ${event.location}</p>
      <p><strong>Mô tả:</strong> ${event.description || "Không có mô tả"}</p>
    </div>
  `;
}

async function loadEventsForRegistration() {
  try {
    const response = await fetch("http://localhost:5000/api/events");

    if (!response.ok) {
      throw new Error("Không tải được danh sách sự kiện");
    }

    const events = await response.json();
    eventsData = events;

    eventSelectEl.innerHTML = `
      <option value="">-- Chọn sự kiện muốn tham gia --</option>
      ${events
        .map(
          (event) => `
            <option value="${event.id}">
              ${event.title} - ${formatDate(event.event_time)}
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
  }
}

eventSelectEl.addEventListener("change", (e) => {
  renderSelectedEventInfo(e.target.value);
});

loadEventsForRegistration();