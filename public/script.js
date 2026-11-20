const $ = (id) => document.getElementById(id);

const POLL_MS = 5000;

let lastTrackKey = "";
let isRefreshing = false;

function setStatus(online, label) {
  $("status-dot").parentElement.classList.toggle("online", online);
  $("status-label").textContent = label;
}

function showOffline() {
  setStatus(false, "OFFLINE");

  $("play-state").textContent = "NOT LISTENING";
  $("track-title").textContent = "Nothing playing";
  $("track-artist").textContent =
    "When playback starts, it will appear here.";
  $("track-album").textContent = "";

  $("cover").src = "/cover-placeholder.svg";
  $("spotify-link").hidden = true;

  lastTrackKey = "";
}

function showError(message) {
  setStatus(false, "UNAVAILABLE");

  $("play-state").textContent = "CONNECTION ISSUE";
  $("track-title").textContent = "Unable to load status";
  $("track-artist").textContent =
    message || "Trying again shortly.";
  $("track-album").textContent = "";

  $("cover").src = "/cover-placeholder.svg";
  $("spotify-link").hidden = true;
}

async function refresh() {
  if (isRefreshing) return;

  isRefreshing = true;

  try {
    const response = await fetch("/api/now-playing", {
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "API unavailable");
    }

    if (!data.isPlaying || !data.track) {
      showOffline();
    } else {
      const t = data.track;

      const key = `${t.id || ""}|${t.title}|${t.artist}|${t.album}`;

      setStatus(true, "LIVE NOW");
      $("play-state").textContent = "NOW PLAYING";

      if (key !== lastTrackKey) {
        lastTrackKey = key;

        $("track-title").textContent =
          t.title || "Unknown track";

        $("track-artist").textContent =
          t.artist || "Unknown artist";

        $("track-album").textContent =
          t.album || "";

        $("cover").src =
          t.image || "/cover-placeholder.svg";

        if (t.url) {
          $("spotify-link").href = t.url;
          $("spotify-link").hidden = false;
        } else {
          $("spotify-link").hidden = true;
        }
      }
    }

    $("updated").textContent =
      "Checked " +
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });

  } catch (error) {
    showError(error.message);
  } finally {
    isRefreshing = false;
  }
}

refresh();

setInterval(refresh, POLL_MS);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
