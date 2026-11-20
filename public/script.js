
const $ = (id) => document.getElementById(id);

const POLL_MS = 5000;

let lastTrackKey = "";
let isRefreshing = false;

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setStatus(online, label) {
  const dot = $("status-dot");
  const labelEl = $("status-label");

  if (dot?.parentElement) {
    dot.parentElement.classList.toggle("online", online);
  }

  if (labelEl) labelEl.textContent = label;
}

function setCover(src) {
  const cover = $("cover");
  if (cover) cover.src = src;
}

function setSpotifyLink(url) {
  const link = $("spotify-link");

  if (!link) return;

  if (url) {
    link.href = url;
    link.textContent = "OPEN ON SPOTIFY ↗";
    link.hidden = false;
  } else {
    link.hidden = true;
  }
}

function showOffline() {
  setStatus(false, "OFFLINE");

  setText("play-state", "NOT LISTENING");
  setText("track-title", "Nothing playing");
  setText(
    "track-artist",
    "When playback starts, it will appear here."
  );
  setText("track-album", "");

  setCover("/cover-placeholder.svg");
  setSpotifyLink("");

  lastTrackKey = "";
}

function showError(message) {
  setStatus(false, "UNAVAILABLE");

  setText("play-state", "CONNECTION ISSUE");
  setText("track-title", "Unable to load status");
  setText("track-artist", message || "Trying again shortly.");
  setText("track-album", "");

  setCover("/cover-placeholder.svg");
  setSpotifyLink("");
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
      setText("play-state", "NOW PLAYING");

      if (key !== lastTrackKey) {
        lastTrackKey = key;

        setText("track-title", t.title || "Unknown track");
        setText("track-artist", t.artist || "Unknown artist");
        setText("track-album", t.album || "");

        setCover(t.image || "/cover-placeholder.svg");
      }

      setSpotifyLink(t.url);
    }

    setText(
      "updated",
      "Checked " +
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })
    );

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
