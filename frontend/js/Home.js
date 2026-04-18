(function initializeHomePage() {
  var adminActionEl = document.getElementById("home-admin-action");
  var sessionTextEl = document.getElementById("home-session-text");
  var quickLoginEl = document.getElementById("home-quick-login-link");
  var logoutButtonEl = document.getElementById("home-logout-button");

  function setGuestState() {
    if (sessionTextEl) {
      sessionTextEl.textContent = "Người dùng có thể đăng ký sự kiện ngay, còn admin bấm mở form đăng nhập để vào khu vực quản trị.";
    }

    if (adminActionEl) {
      adminActionEl.textContent = "Đăng nhập admin";
      adminActionEl.href = window.AppConfig.toAppUrl("/LoginAdmin.html");
    }

    if (quickLoginEl) {
      quickLoginEl.href = window.AppConfig.toAppUrl("/LoginAdmin.html");
      quickLoginEl.textContent = "Đăng nhập admin";
    }

    if (logoutButtonEl) {
      logoutButtonEl.classList.add("hidden");
    }
  }

  setGuestState();
})();
