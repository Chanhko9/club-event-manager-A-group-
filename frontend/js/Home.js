(function initializeHomePage() {
  var API_BASE_URL = window.AppConfig.API_BASE_URL;
  var adminActionEl = document.getElementById("home-admin-action");
  var sessionTextEl = document.getElementById("home-session-text");
  var quickLoginEl = document.getElementById("home-quick-login-link");
  var logoutButtonEl = document.getElementById("home-logout-button");

  function setGuestState() {
    if (sessionTextEl) {
      sessionTextEl.textContent = "Người dùng có thể đăng ký sự kiện ngay, còn admin đăng nhập để quản trị toàn bộ hệ thống.";
    }

    if (adminActionEl) {
      adminActionEl.textContent = "Đăng nhập admin";
      adminActionEl.href = window.AppConfig.toAppUrl("/LoginAdmin.html");
    }

    if (quickLoginEl) {
      quickLoginEl.href = window.AppConfig.toAppUrl("/LoginAdmin.html");
    }

    if (logoutButtonEl) {
      logoutButtonEl.classList.add("hidden");
    }
  }

  function setAdminState(session) {
    var admin = session && session.admin ? session.admin : {};
    var adminName = admin.full_name || admin.username || "Admin";

    if (sessionTextEl) {
      sessionTextEl.textContent = "Đang đăng nhập với tài khoản " + adminName + ". Bạn có thể vào khu vực quản trị ngay bây giờ.";
    }

    if (adminActionEl) {
      adminActionEl.textContent = "Vào khu vực quản trị";
      adminActionEl.href = window.AppConfig.toAppUrl("/TaoSuKien.html");
    }

    if (quickLoginEl) {
      quickLoginEl.href = window.AppConfig.toAppUrl("/TaoSuKien.html");
      quickLoginEl.textContent = "Mở bảng điều khiển";
    }

    if (logoutButtonEl) {
      logoutButtonEl.classList.remove("hidden");
    }
  }

  async function checkSession() {
    try {
      var response = await fetch(API_BASE_URL + "/admin/session", {
        method: "GET",
        credentials: "include"
      });

      if (!response.ok) {
        setGuestState();
        return;
      }

      var session = await window.AppConfig.readJsonSafely(response);
      if (session && session.isAuthenticated) {
        setAdminState(session);
        return;
      }
    } catch (error) {
      console.error(error);
    }

    setGuestState();
  }

  if (logoutButtonEl) {
    logoutButtonEl.addEventListener("click", async function () {
      await fetch(API_BASE_URL + "/admin/logout", {
        method: "POST",
        credentials: "include"
      }).catch(function () {});
      window.location.href = window.AppConfig.toAppUrl("/");
    });
  }

  if (adminActionEl) {
    adminActionEl.href = window.AppConfig.toAppUrl("/LoginAdmin.html");
  }

  if (quickLoginEl) {
    quickLoginEl.href = window.AppConfig.toAppUrl("/LoginAdmin.html");
  }

  checkSession();
})();
