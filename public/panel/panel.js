
const $ = id => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {})
    }
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

// ========================================
// VIEW
// ========================================

function showDashboard() {
  $("login-view").hidden = true;
  $("dashboard-view").hidden = false;
  $("menu-toggle").hidden = false;
}

function showLogin() {
  closeMenu();
  $("dashboard-view").hidden = true;
  $("login-view").hidden = false;
  $("menu-toggle").hidden = true;
}

// ========================================
// MENU
// ========================================

function openMenu() {
  $("navigation").classList.add("open");
  $("menu-overlay").classList.add("open");

  $("navigation").setAttribute("aria-hidden", "false");
  $("menu-toggle").setAttribute("aria-expanded", "true");
}

function closeMenu() {
  $("navigation").classList.remove("open");
  $("menu-overlay").classList.remove("open");

  $("navigation").setAttribute("aria-hidden", "true");
  $("menu-toggle").setAttribute("aria-expanded", "false");
}

$("menu-toggle").addEventListener("click", openMenu);
$("menu-close").addEventListener("click", closeMenu);
$("menu-overlay").addEventListener("click", closeMenu);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});

// ========================================
// STATUS
// ========================================

async function loadStatus() {
  const data = await api("/api/admin/status");

  $("current-mode").textContent =
    data.status === "offline"
      ? "FORCE OFFLINE"
      : data.status === "online"
        ? "FORCE ONLINE"
        : "AUTO";

  $("mode-description").textContent =
    data.status === "offline"
      ? "Your public page is manually set to offline."
      : data.status === "online"
        ? "Your public page is manually set to online."
        : "Your public page follows Spotify playback.";
}

async function loadSpotifyStatus() {
  const data = await api("/api/admin/spotify/status");

  if (data.connected) {
    $("spotify-status").textContent = "CONNECTED";
    $("spotify-description").textContent =
      "Your Spotify account is connected to LUXX.";

    $("spotify-connect-button").textContent =
      "RECONNECT SPOTIFY";
  } else {
    $("spotify-status").textContent = "NOT CONNECTED";
    $("spotify-description").textContent =
      "Connect your Spotify account to enable live listening.";

    $("spotify-connect-button").textContent =
      "CONNECT SPOTIFY";
  }
}

// ========================================
// LOGIN
// ========================================

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("login-button");

  $("login-error").textContent = "";
  button.disabled = true;
  button.textContent = "SIGNING IN...";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: $("password").value
      })
    });

    $("password").value = "";

    showDashboard();

    await Promise.all([
      loadStatus(),
      loadSpotifyStatus()
    ]);

  } catch (error) {
    $("login-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "SIGN IN";
  }
});

// ========================================
// SPOTIFY CONNECT
// ========================================

$("spotify-connect-button").addEventListener("click", async () => {
  const button = $("spotify-connect-button");

  button.disabled = true;
  button.textContent = "CONNECTING...";

  $("spotify-message").textContent = "";

  try {
    const data = await api("/api/admin/spotify/connect");

    if (!data.url) {
      throw new Error("Spotify authorization URL missing");
    }

    window.location.href = data.url;

  } catch (error) {
    $("spotify-message").textContent = error.message;
    button.disabled = false;
    button.textContent = "CONNECT SPOTIFY";
  }
});

// ========================================
// AUTO MODE
// ========================================

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

// ========================================
// FORCE OFFLINE
// ========================================

$("offline-button").addEventListener("click", async () => {
  try {
    await api("/api/admin/status", {
      method: "POST",
      body: JSON.stringify({ status: "offline" })
    });

    $("action-message").textContent =
      "Public status set to offline.";

    await loadStatus();

  } catch (error) {
    $("action-message").textContent = error.message;
  }
});

// ========================================
// LOGOUT
// ========================================

async function logout() {
  const button = $("nav-logout");

  button.disabled = true;
  button.innerHTML = "<span>LOGGING OUT...</span>";

  try {
    const response = await fetch("/api/admin/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Logout request failed");
    }

    window.location.replace("/panel/");

  } catch (error) {
    button.disabled = false;
    button.innerHTML = "<span>LOG OUT</span><span>↗</span>";

    alert("Logout failed: " + error.message);
  }
}

$("nav-logout").addEventListener("click", logout);

// ========================================
// INITIALIZATION
// ========================================

async function init() {
  const params = new URLSearchParams(location.search);

  try {
    await Promise.all([
      loadStatus(),
      loadSpotifyStatus()
    ]);

    showDashboard();

    if (params.get("spotify") === "connected") {
      $("spotify-message").textContent =
        "Spotify successfully connected.";

      history.replaceState({}, "", location.pathname);
    }

  } catch {
    showLogin();
  }
}

init();
