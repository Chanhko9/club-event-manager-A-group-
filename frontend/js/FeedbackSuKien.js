var API_BASE_URL = window.AppConfig.API_BASE_URL;

var accessFormEl = document.getElementById("access-form");
var feedbackFormEl = document.getElementById("feedback-form");
var eventSelectEl = document.getElementById("event_id");
var selectedEventInfoEl = document.getElementById("selected-event-info");
var pageMessageEl = document.getElementById("page-message");
var feedbackSectionEl = document.getElementById("feedback-form-section");
var submittedSectionEl = document.getElementById("submitted-section");
var participantInfoEl = document.getElementById("participant-info");
var submittedMessageEl = document.getElementById("submitted-message");
var submittedSummaryEl = document.getElementById("submitted-summary");
var satisfactionQuestionLabelEl = document.getElementById("satisfaction-question-label");
var commentQuestionLabelEl = document.getElementById("comment-question-label");
var submitFeedbackButtonEl = document.getElementById("submit-feedback-button");

var eventsData = [];
var currentAccessContext = null;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(dateString) {
  if (!dateString) {
    return "Chưa cập nhật";
  }

  return new Date(dateString).toLocaleString("vi-VN");
}

function getEventIdFromUrl() {
  var params = new URLSearchParams(window.location.search);
  return params.get("eventId");
}

function showMessage(message, type) {
  pageMessageEl.textContent = message;
  pageMessageEl.className = "form-message " + type;
}

function clearMessage() {
  pageMessageEl.textContent = "";
  pageMessageEl.className = "form-message";
}

function renderSelectedEventInfo(eventId) {
  var event = eventsData.find(function (item) {
    return String(item.id) === String(eventId);
  });

  if (!event) {
    selectedEventInfoEl.innerHTML = "";
    return;
  }

  selectedEventInfoEl.innerHTML = [
    '<h3>' + escapeHtml(event.title) + '</h3>',
    '<p><strong>Thời gian:</strong> ' + formatDate(event.event_time) + '</p>',
    '<p><strong>Địa điểm:</strong> ' + escapeHtml(event.location) + '</p>',
    '<p><strong>Trạng thái feedback:</strong> ' + (event.feedback_enabled ? "Đang mở" : "Chưa mở") + '</p>'
  ].join("");
}

function renderSubmittedState(message, response) {
  submittedSectionEl.classList.remove("hidden");
  submittedMessageEl.textContent = message || "Bạn đã gửi feedback cho sự kiện này rồi.";
  submittedSummaryEl.innerHTML = response
    ? [
        '<p><strong>Mức độ hài lòng:</strong> ' + "★".repeat(Number(response.satisfaction_rating || 0)) + '</p>',
        '<p><strong>Góp ý:</strong> ' + escapeHtml(response.comment || "Không có góp ý") + '</p>',
        '<p><strong>Thời gian gửi:</strong> ' + formatDate(response.created_at) + '</p>'
      ].join("")
    : '<p>Hệ thống đã ghi nhận phản hồi của bạn.</p>';
}

function setFeedbackQuestions(feedbackForm) {
  satisfactionQuestionLabelEl.textContent = (feedbackForm && feedbackForm.satisfaction_question) || "Mức độ hài lòng của bạn";
  commentQuestionLabelEl.textContent = (feedbackForm && feedbackForm.comment_question) || "Góp ý của bạn";
}

async function loadEvents() {
  var response = await fetch(API_BASE_URL + "/events");
  var result = await window.AppConfig.readJsonSafely(response);

  if (!response.ok) {
    throw new Error((result && result.message) || "Không tải được danh sách sự kiện.");
  }

  eventsData = Array.isArray(result) ? result : [];
  eventSelectEl.innerHTML = [
    '<option value="">Chọn sự kiện</option>',
    eventsData.map(function (event) {
      return '<option value="' + event.id + '">' + escapeHtml(event.title) + (event.feedback_enabled ? "" : " (chưa mở feedback)") + '</option>';
    }).join("")
  ].join("");

  var eventIdFromUrl = getEventIdFromUrl();
  if (eventIdFromUrl) {
    eventSelectEl.value = eventIdFromUrl;
    renderSelectedEventInfo(eventIdFromUrl);
  }
}

async function requestFeedbackAccess(payload) {
  var response = await fetch(API_BASE_URL + "/events/" + payload.event_id + "/feedback-access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  var result = await window.AppConfig.readJsonSafely(response);

  if (!response.ok) {
    var error = new Error((result && result.message) || "Không thể xác minh người tham gia.");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

async function submitFeedback(payload) {
  var response = await fetch(API_BASE_URL + "/events/" + payload.event_id + "/feedback-responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  var result = await window.AppConfig.readJsonSafely(response);

  if (!response.ok) {
    var error = new Error((result && result.message) || "Không thể gửi feedback.");
    error.status = response.status;
    error.payload = result;
    throw error;
  }

  return result;
}

if (eventSelectEl) {
  eventSelectEl.addEventListener("change", function (event) {
    clearMessage();
    renderSelectedEventInfo(event.target.value);
    feedbackSectionEl.classList.add("hidden");
    submittedSectionEl.classList.add("hidden");
  });
}

if (accessFormEl) {
  accessFormEl.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearMessage();
    feedbackSectionEl.classList.add("hidden");
    submittedSectionEl.classList.add("hidden");

    var formData = new FormData(accessFormEl);
    var payload = {
      event_id: formData.get("event_id"),
      student_id: formData.get("student_id"),
      email: formData.get("email")
    };

    try {
      showMessage("Đang xác minh thông tin...", "info");
      var result = await requestFeedbackAccess(payload);

      currentAccessContext = payload;
      participantInfoEl.textContent = "Người gửi: " + result.participant.full_name + " • " + result.participant.student_id + " • " + result.participant.email;
      setFeedbackQuestions(result.feedbackForm);
      feedbackFormEl.reset();

      if (result.hasSubmitted) {
        renderSubmittedState("Bạn đã gửi feedback cho sự kiện này rồi.", result.feedbackResponse);
        showMessage("Đã tìm thấy phản hồi trước đó của bạn.", "success");
        return;
      }

      feedbackSectionEl.classList.remove("hidden");
      showMessage("Xác minh thành công. Bạn có thể gửi feedback ngay bây giờ.", "success");
    } catch (error) {
      showMessage(error.message || "Không thể xác minh người tham gia.", "error");
      console.error(error);
    }
  });
}

if (feedbackFormEl) {
  feedbackFormEl.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!(currentAccessContext && currentAccessContext.event_id)) {
      showMessage("Vui lòng xác minh thông tin trước khi gửi feedback.", "error");
      return;
    }

    var formData = new FormData(feedbackFormEl);
    var payload = {
      event_id: currentAccessContext.event_id,
      student_id: currentAccessContext.student_id,
      email: currentAccessContext.email,
      satisfaction_rating: formData.get("satisfaction_rating"),
      comment: formData.get("comment")
    };

    try {
      submitFeedbackButtonEl.disabled = true;
      showMessage("Đang gửi feedback...", "info");

      var result = await submitFeedback(payload);
      feedbackSectionEl.classList.add("hidden");
      renderSubmittedState(result.message, result.feedbackResponse);
      showMessage((result && result.message) || "Gửi feedback thành công.", "success");
    } catch (error) {
      showMessage(error.message || "Không thể gửi feedback.", "error");
      console.error(error);
    } finally {
      submitFeedbackButtonEl.disabled = false;
    }
  });
}

loadEvents().catch(function (error) {
  showMessage(error.message || "Không tải được danh sách sự kiện.", "error");
  console.error(error);
});
