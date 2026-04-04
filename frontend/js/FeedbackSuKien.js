function getApiBaseUrl() {
  const isLocalBrowserHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isBackendOrigin = isLocalBrowserHost && window.location.port === "5000";

  if (window.location.protocol === "file:" || (isLocalBrowserHost && !isBackendOrigin)) {
    return "http://localhost:5000/api";
  }

  return `${window.location.origin}/api`;
}

const API_BASE_URL = getApiBaseUrl();

const accessFormEl = document.getElementById("access-form");
const feedbackFormEl = document.getElementById("feedback-form");
const eventSelectEl = document.getElementById("event_id");
const selectedEventInfoEl = document.getElementById("selected-event-info");
const pageMessageEl = document.getElementById("page-message");
const feedbackSectionEl = document.getElementById("feedback-form-section");
const submittedSectionEl = document.getElementById("submitted-section");
const participantInfoEl = document.getElementById("participant-info");
const submittedMessageEl = document.getElementById("submitted-message");
const submittedSummaryEl = document.getElementById("submitted-summary");
const satisfactionQuestionLabelEl = document.getElementById("satisfaction-question-label");
const commentQuestionLabelEl = document.getElementById("comment-question-label");
const submitFeedbackButtonEl = document.getElementById("submit-feedback-button");

let eventsData = [];
let currentAccessContext = null;

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
  return new Date(dateString).toLocaleString("vi-VN");
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

function showMessage(message, type) {
  pageMessageEl.textContent = message;
  pageMessageEl.className = `form-message ${type}`;
}

function clearMessage() {
  pageMessageEl.textContent = "";
  pageMessageEl.className = "form-message";
}

function renderSelectedEventInfo(eventId) {
  const event = eventsData.find((item) => String(item.id) === String(eventId));

  if (!event) {
    selectedEventInfoEl.innerHTML = "";
    return;
  }

  selectedEventInfoEl.innerHTML = `
    <h3>${escapeHtml(event.title)}</h3>
    <p><strong>Thời gian:</strong> ${formatDate(event.event_time)}</p>
    <p><strong>Địa điểm:</strong> ${escapeHtml(event.location)}</p>
    <p><strong>Mở feedback:</strong> ${event.feedback_enabled ? "Có" : "Chưa mở"}</p>
  `;
}

function renderSubmittedState(message, response) {
  submittedSectionEl.classList.remove("hidden");
  submittedMessageEl.textContent = message || "Bạn đã gửi feedback cho sự kiện này rồi.";
  submittedSummaryEl.innerHTML = response
    ? `
      <p><strong>Mức độ hài lòng:</strong> ${"★".repeat(Number(response.satisfaction_rating || 0))}</p>
      <p><strong>Góp ý:</strong> ${escapeHtml(response.comment || "Không có góp ý")}</p>
      <p><strong>Thời gian gửi:</strong> ${formatDate(response.created_at)}</p>
    `
    : `<p>Hệ thống đã ghi nhận phản hồi của bạn.</p>`;
}

function setFeedbackQuestions(feedbackForm) {
  satisfactionQuestionLabelEl.textContent =
    feedbackForm?.satisfaction_question || "Mức độ hài lòng của bạn về sự kiện là gì?";
  commentQuestionLabelEl.textContent =
    feedbackForm?.comment_question || "Bạn có góp ý gì để sự kiện sau tốt hơn không?";
}

async function loadEvents() {
  const response = await fetch(`${API_BASE_URL}/events`);
  const result = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(result?.message || "Không tải được danh sách sự kiện.");
  }

  eventsData = Array.isArray(result) ? result : [];
  eventSelectEl.innerHTML = `
    <option value="">-- Chọn sự kiện đã tham gia --</option>
    ${eventsData
      .map(
        (event) => `
          <option value="${event.id}">
            ${escapeHtml(event.title)} ${event.feedback_enabled ? "" : "(chưa mở feedback)"}
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
}

async function requestFeedbackAccess(payload) {
  const response = await fetch(`${API_BASE_URL}/events/${payload.event_id}/feedback-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(result?.message || "Không thể xác minh người tham gia.");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

async function submitFeedback(payload) {
  const response = await fetch(`${API_BASE_URL}/events/${payload.event_id}/feedback-responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(result?.message || "Không thể gửi feedback.");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

eventSelectEl?.addEventListener("change", (event) => {
  clearMessage();
  renderSelectedEventInfo(event.target.value);
  feedbackSectionEl.classList.add("hidden");
  submittedSectionEl.classList.add("hidden");
});

accessFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  feedbackSectionEl.classList.add("hidden");
  submittedSectionEl.classList.add("hidden");

  const formData = new FormData(accessFormEl);
  const payload = {
    event_id: formData.get("event_id"),
    student_id: formData.get("student_id"),
    email: formData.get("email")
  };

  try {
    showMessage("Đang xác minh thông tin tham gia...", "success");
    const result = await requestFeedbackAccess(payload);

    currentAccessContext = payload;
    participantInfoEl.textContent = `Người gửi: ${result.participant.full_name} - ${result.participant.student_id} - ${result.participant.email}`;
    setFeedbackQuestions(result.feedbackForm);
    feedbackFormEl.reset();

    if (result.hasSubmitted) {
      renderSubmittedState("Bạn đã gửi feedback cho sự kiện này rồi.", result.feedbackResponse);
      showMessage("Hệ thống đã tìm thấy feedback trước đó của bạn.", "success");
      return;
    }

    feedbackSectionEl.classList.remove("hidden");
    showMessage("Xác minh thành công. Bạn có thể gửi feedback ngay bây giờ.", "success");
  } catch (error) {
    showMessage(error.message || "Không thể xác minh người tham gia.", "error");
    console.error(error);
  }
});

feedbackFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentAccessContext?.event_id) {
    showMessage("Vui lòng xác minh người tham gia trước khi gửi feedback.", "error");
    return;
  }

  const formData = new FormData(feedbackFormEl);
  const payload = {
    ...currentAccessContext,
    satisfaction_rating: formData.get("satisfaction_rating"),
    comment: formData.get("comment")
  };

  try {
    submitFeedbackButtonEl.disabled = true;
    showMessage("Đang gửi feedback...", "success");

    const result = await submitFeedback(payload);
    feedbackSectionEl.classList.add("hidden");
    renderSubmittedState(result.message, result.feedbackResponse);
    showMessage(result.message || "Gửi feedback thành công.", "success");
  } catch (error) {
    showMessage(error.message || "Không thể gửi feedback.", "error");
    console.error(error);
  } finally {
    submitFeedbackButtonEl.disabled = false;
  }
});

loadEvents().catch((error) => {
  showMessage(error.message || "Không tải được danh sách sự kiện.", "error");
  console.error(error);
});
