(function attachAppConfig(windowObject) {
  if (windowObject.AppConfig) {
    return;
  }

  function getAppBaseUrl() {
    var localHosts = ["localhost", "127.0.0.1"];
    var isLocalHost = localHosts.indexOf(window.location.hostname) !== -1;

    if (window.location.protocol === "file:") {
      return "http://localhost:5000";
    }

    if (isLocalHost && window.location.port && window.location.port !== "5000") {
      return window.location.protocol + "//" + window.location.hostname + ":5000";
    }

    return window.location.origin;
  }

  function normalizeRedirectPath(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    if (/^https?:\/\//i.test(raw)) {
      try {
        var parsedUrl = new URL(raw);
        return (parsedUrl.pathname || "/") + (parsedUrl.search || "");
      } catch (error) {
        return "";
      }
    }

    if (raw.indexOf("javascript:") === 0 || raw.indexOf("//") === 0) {
      return "";
    }

    if (raw.indexOf("./") === 0) {
      raw = raw.slice(1);
    }

    return raw.charAt(0) === "/" ? raw : "/" + raw.replace(/^\/+/, "");
  }

  function toAppUrl(path) {
    var normalizedPath = normalizeRedirectPath(path || "/");
    return APP_BASE_URL + (normalizedPath || "/");
  }

  async function readJsonSafely(response) {
    var text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  var APP_BASE_URL = getAppBaseUrl();

  windowObject.AppConfig = {
    APP_BASE_URL: APP_BASE_URL,
    API_BASE_URL: APP_BASE_URL + "/api",
    normalizeRedirectPath: normalizeRedirectPath,
    toAppUrl: toAppUrl,
    readJsonSafely: readJsonSafely
  };
})(window);
