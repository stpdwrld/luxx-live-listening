
const $ = id => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function showDashboard() {
  $("login-view").hidden = true;
  $("dashboard-view").hidden = false;
}

function showLogin() {
  $("dashboard-view").hidden = true;
  $("login-view").hidden = false;
}

async function loadStatus() {
  const data = await api("/api/admin/status");

  $("current-mode").textContent =
    data.mode === "offline" ? "FORCE OFFLINE" : "AUTO";

  $("mode-description").textContent =
    data.mode === "offline"
      ? "Your public page is manually set to offline."
      : "Your public page follows Last.fm playback.";
}

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("login-error").textContent = "";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value,
        password: $("password").value
      })
    });

    $("password").value = "";
    showDashboard();
    await loadStatus();
  } catch (error) {
    $("login-error").textContent = error.message;
  }
});

$("auto-button").addEventListener("click", async () => {
  try {
    await api("/api/admin/status", {
      method: "POST",
      body: JSON.stringify({ status: "auto" })
    });

    $("action-message").textContent = "AUTO mode activated.";
    await loadStatus();
  } catch (error) {
    $("action-message").textContent = error.message;
  }
});

$("offline-button").addEventListener("click", async () => {
  try {
    await api("/api/admin/status", {
      method: "POST",
      body: JSON.stringify({ status: "offline" })
    });

    $("action-message").textContent = "Public status set to offline.";
    await loadStatus();
  } catch (error) {
    $("action-message").textContent = error.message;
  }
});

$("logout-button").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } finally {
    showLogin();
  }
});

async function init() {
  try {
    await loadStatus();
    showDashboard();
  } catch {
    showLogin();
  }
}

init();
