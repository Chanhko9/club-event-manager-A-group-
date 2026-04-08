(function attachAdminAuth(windowObject) {
  if (windowObject.AdminAuth) {
    return;
  }

  var API_BASE_URL = windowObject.AppConfig.API_BASE_URL;
  var APP_BASE_URL = windowObject.AppConfig.APP_BASE_URL;
  var originalFetch = window.fetch.bind(window);

  function getRedirectTarget() {
    var rawPath = window.location.pathname + window.location.search;
    return windowObject.AppConfig.normalizeRedirectPath(rawPath) || "/TaoSuKien.html";
  }

  function buildLoginUrl(redirectTarget) {
    var safeRedirectTarget = windowObject.AppConfig.normalizeRedirectPath(redirectTarget || getRedirectTarget());
    var params = new URLSearchParams();

    if (safeRedirectTarget) {
      params.set("redirect", safeRedirectTarget);
    }

    var queryString = params.toString();
    return APP_BASE_URL + "/LoginAdmin.html" + (queryString ? "?" + queryString : "");
  }

  function redirectToLogin(redirectTarget) {
    window.location.href = buildLoginUrl(redirectTarget);
  }

  async function ensureAdminSession(options) {
    var settings = options || {};
    var redirectOnFail = settings.redirectOnFail !== false;
    var response = await originalFetch(API_BASE_URL + "/admin/session", {
      method: "GET",
      credentials: "include"
    });

    var result = await windowObject.AppConfig.readJsonSafely(response);
    if (!response.ok) {
      if (redirectOnFail) {
        redirectToLogin();
      }

      var error = new Error((result && result.message) || "Phiên đăng nhập admin đã hết hạn.");
      error.status = response.status;
      error.payload = result;
      throw error;
    }

    return result;
  }

  async function logoutAdmin() {
    await originalFetch(API_BASE_URL + "/admin/logout", {
      method: "POST",
      credentials: "include"
    });

    window.location.href = APP_BASE_URL + "/LoginAdmin.html";
  }

  async function authAwareFetch(input, init) {
    var nextInit = Object.assign({}, init || {}, {
      credentials: "include"
    });

    var response = await originalFetch(input, nextInit);
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var isApiRequest = url.indexOf("/api/") !== -1 || url.indexOf(API_BASE_URL) === 0;

    if (response.status === 401 && isApiRequest) {
      redirectToLogin();
      var payload = await response.clone().json().catch(function () { return null; });
      var error = new Error((payload && payload.message) || "Bạn cần đăng nhập admin.");
      error.status = 401;
      error.payload = payload;
      throw error;
    }

    return response;
  }

  window.fetch = authAwareFetch;

  windowObject.AdminAuth = {
    API_BASE_URL: API_BASE_URL,
    APP_BASE_URL: APP_BASE_URL,
    ensureAdminSession: ensureAdminSession,
    logoutAdmin: logoutAdmin,
    redirectToLogin: redirectToLogin,
    buildLoginUrl: buildLoginUrl,
    originalFetch: originalFetch
  };
})(window);
