var API_BASE_URL = window.AppConfig.API_BASE_URL;

var loginFormEl = document.getElementById("admin-login-form");
var loginMessageEl = document.getElementById("login-message");
var submitLoginButtonEl = document.getElementById("submit-login-button");
var identifierEl = document.getElementById("identifier");
var passwordEl = document.getElementById("password");

function getRedirectTarget() {
  var params = new URLSearchParams(window.location.search);
  return window.AppConfig.normalizeRedirectPath(params.get("redirect")) || "/TaoSuKien.html";
}

function navigateToAppPath(path) {
  window.location.href = window.AppConfig.toAppUrl(path);
}

function showMessage(message, type) {
  if (!loginMessageEl) {
    return;
  }

  loginMessageEl.textContent = message;
  loginMessageEl.className = "form-message " + type;
}

function clearMessage() {
  if (!loginMessageEl) {
    return;
  }

  loginMessageEl.textContent = "";
  loginMessageEl.className = "form-message";
}

async function checkExistingSession() {
  var response = await fetch(API_BASE_URL + "/admin/session", {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    return null;
  }

  return window.AppConfig.readJsonSafely(response);
}

if (loginFormEl) {
  loginFormEl.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearMessage();

    var identifier = (identifierEl && identifierEl.value.trim()) || "";
    var password = (passwordEl && passwordEl.value) || "";

    if (!identifier || !password) {
      showMessage("Vui lòng nhập tài khoản admin và mật khẩu.", "error");
      return;
    }

    try {
      submitLoginButtonEl.disabled = true;
      showMessage("Đang đăng nhập...", "info");

      var response = await fetch(API_BASE_URL + "/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          identifier: identifier,
          password: password,
          redirect: getRedirectTarget()
        })
      });

      var result = await window.AppConfig.readJsonSafely(response);
      if (!response.ok) {
        throw new Error((result && result.message) || "Đăng nhập admin thất bại.");
      }

      showMessage((result && result.message) || "Đăng nhập thành công.", "success");
      navigateToAppPath((result && result.redirectTo) || getRedirectTarget());
    } catch (error) {
      showMessage(error.message || "Đăng nhập admin thất bại.", "error");
    } finally {
      submitLoginButtonEl.disabled = false;
    }
  });
}

checkExistingSession()
  .catch(function () {
    return null;
  })
  .finally(function () {
    if (identifierEl) {
      identifierEl.focus();
    }
  });
