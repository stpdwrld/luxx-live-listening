
const $ = (id) => document.getElementById(id);

const POLL_MS = 5000;
const TIMER_MS = 1000;

let lastTrackKey = "";
let isRefreshing = false;

let playbackProgress = 0;
let playbackDuration = 0;
let playbackStartedAt = 0;
let isTrackPlaying = false;

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

function formatTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function currentProgress() {
  if (!isTrackPlaying) return playbackProgress;

  const elapsed = Date.now() - playbackStartedAt;

  return Math.min(
    playbackDuration,
    playbackProgress + Math.max(0, elapsed)
  );
}

function renderProgress() {
  const wrapper = $("playback-progress");
  const fill = $("progress-fill");

  if (!wrapper || !fill) return;

  if (!playbackDuration) {
    wrapper.hidden = true;
    return;
  }

  wrapper.hidden = false;

  const progress = currentProgress();
  const percentage = Math.min(
    100,
    (progress / playbackDuration) * 100
  );

  fill.style.width = `${percentage}%`;

  setText("progress-current", formatTime(progress));
  setText("progress-duration", formatTime(playbackDuration));
}

function syncProgress(progress, duration, playing) {
  playbackProgress = Math.max(0, Number(progress) || 0);
  playbackDuration = Math.max(0, Number(duration) || 0);
  playbackStartedAt = Date.now();
  isTrackPlaying = !!playing;

  renderProgress();
}

function resetProgress() {
  playbackProgress = 0;
  playbackDuration = 0;
  playbackStartedAt = 0;
  isTrackPlaying = false;

  const wrapper = $("playback-progress");
  const fill = $("progress-fill");

  if (wrapper) wrapper.hidden = true;
  if (fill) fill.style.width = "0%";

  setText("progress-current", "0:00");
  setText("progress-duration", "0:00");
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

  resetProgress();

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

  resetProgress();
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

    if (!data.track) {
      showOffline();
    } else {
      const t = data.track;

      const key = `${t.id || ""}|${t.title}|${t.artist}|${t.album}`;

      const playing = !!data.isPlaying;

      setStatus(true, playing ? "LIVE NOW" : "PAUSED");
      setText("play-state", playing ? "NOW PLAYING" : "PAUSED");

      if (key !== lastTrackKey) {
        lastTrackKey = key;

        setText("track-title", t.title || "Unknown track");
        setText("track-artist", t.artist || "Unknown artist");
        setText("track-album", t.album || "");

        setCover(t.image || "/cover-placeholder.svg");
      }

      setSpotifyLink(t.url);

      syncProgress(
        data.progress,
        t.duration,
        playing
      );
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

// Initial load
refresh();

// Sync with Spotify every 5 seconds
setInterval(refresh, POLL_MS);

// Smooth local timer every second
setInterval(() => {
  renderProgress();
}, TIMER_MS);

// Refresh when user returns to the page
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
