
const $ = (id) => document.getElementById(id);
const POLL_MS = 15000;
let lastTrackKey = "";

function setStatus(online, label) {
  $("status-dot").parentElement.classList.toggle("online", online);
  $("status-label").textContent = label;
}

function showOffline() {
  setStatus(false, "OFFLINE");
  $("play-state").textContent = "NOT LISTENING";
  $("track-title").textContent = "Nothing playing";
  $("track-artist").textContent = "When playback starts, it will appear here.";
  $("track-album").textContent = "";
  $("cover").src = "/cover-placeholder.svg";
  $("lastfm-link").hidden = true;
}

function showError(message) {
  setStatus(false, "UNAVAILABLE");
  $("play-state").textContent = "CONNECTION ISSUE";
  $("track-title").textContent = "Unable to load status";
  $("track-artist").textContent = message || "Trying again shortly.";
  $("track-album").textContent = "";
  $("lastfm-link").hidden = true;
}

async function refresh() {
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

      setStatus(true, "LIVE NOW");

      $("play-state").textContent = "NOW PLAYING";
      $("track-title").textContent = t.title || "Unknown track";
      $("track-artist").textContent = t.artist || "Unknown artist";
      $("track-album").textContent = t.album || "";

      $("cover").src = t.image || "/cover-placeholder.svg";

      const key = `${t.title}|${t.artist}|${t.album}`;

      if (key !== lastTrackKey) {
        lastTrackKey = key;
      }

      if (t.url) {
        $("lastfm-link").href = t.url;
        $("lastfm-link").hidden = false;
      } else {
        $("lastfm-link").hidden = true;
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
  }
}

// Prevent accidental copy handlers from being triggered by ordinary text clicks.
// Links and buttons keep their normal behavior.
document.addEventListener("click", (event) => {
  const target = event.target;

  if (target.closest("button, a")) {
    return;
  }
});

refresh();
setInterval(refresh, POLL_MS);
