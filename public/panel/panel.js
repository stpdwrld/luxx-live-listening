
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

function showDashboard() {
  $("login-view").hidden = true;
  $("dashboard-view").hidden = false;
  $("menu-toggle").hidden = false;
}

function showLogin() {
  $("dashboard-view").hidden = true;
  $("login-view").hidden = false;
  $("menu-toggle").hidden = true;
  $("navigation").hidden = true;
}

async function logout() {
  try {
    await api("/api/admin/logout", {
      method: "POST"
    });
  } finally {
    window.location.href = "/panel/";
  }
}

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

// NAVIGATION
$("menu-toggle").addEventListener("click", () => {
  const menu = $("navigation");
  const isOpen = !menu.hidden;

  menu.hidden = isOpen;

  $("menu-toggle").setAttribute(
    "aria-expanded",
    String(!isOpen)
  );
});

// LOGIN
$("login-form").addEventListener("submit", async event => {
  event.preventDefault();

  $("login-error").textContent = "";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: $("password").value
      })
    });

    $("password").value = "";

    const params = new URLSearchParams(location.search);

    if (params.get("required") === "login") {
      window.location.replace("/panel/stats/");
      return;
    }

    showDashboard();

    await Promise.all([
      loadStatus(),
      loadSpotifyStatus()
    ]);

  } catch (error) {
    $("login-error").textContent = error.message;
  }
});

// SPOTIFY CONNECT
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

// AUTO MODE
$("auto-button").addEventListener("click", async () => {
  try {
    await api("/api/admin/status", {
      method: "POST",
      body: JSON.stringify({ status: "auto" })
    });

    $("action-message").textContent =
      "AUTO mode activated.";

    await loadStatus();

  } catch (error) {
    $("action-message").textContent = error.message;
  }
});

// FORCE OFFLINE
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

// LOGOUT
$("logout-button").addEventListener("click", logout);
$("nav-logout").addEventListener("click", logout);

// INITIALIZATION
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

      history.replaceState(
        {},
        "",
        location.pathname
      );
    }

  } catch {
    showLogin();
  }
}

init();
