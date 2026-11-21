
const $ = id => document.getElementById(id);

let listeningData = null;
let storyBlob = null;

// ========================================
// API
// ========================================

async function loadStats() {
  $("loading").hidden = false;
  $("error").hidden = true;
  $("share-button").disabled = true;
  $("story-preview").hidden = true;

  storyBlob = null;

  try {
    const period = $("period").value;

    const response = await fetch(
      `/api/admin/listening-stats?period=${encodeURIComponent(period)}`,
      {
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to load statistics");
    }

    listeningData = data;
    renderStats(data);

    $("share-button").disabled = false;
    $("loading").hidden = true;

  } catch (error) {
    $("loading").hidden = true;
    $("error").hidden = false;
    $("error").textContent = error.message;
  }
}

// ========================================
// RENDER
// ========================================

function renderStats(data) {
  const user = data.user || {};

  $("total-plays").textContent =
    Number(user.totalPlays || 0).toLocaleString("en-US");

  $("artist-count").textContent =
    Number(user.artistCount || 0).toLocaleString("en-US");

  $("track-count").textContent =
    Number(user.trackCount || 0).toLocaleString("en-US");

  $("album-count").textContent =
    Number(user.albumCount || 0).toLocaleString("en-US");

  renderList("top-artists", data.topArtists, item => ({
    title: item.name,
    subtitle: item.genres?.slice(0, 2).join(", ") || "Artist"
  }));

  renderList("top-tracks", data.topTracks, item => ({
    title: item.name,
    subtitle: getArtist(item)
  }));

  renderList("top-albums", data.topAlbums, item => ({
    title: item.name,
    subtitle: getArtist(item)
  }));

  renderList("recent-tracks", data.recentTracks, item => ({
    title: item.name,
    subtitle: getArtist(item)
  }));
}

function getArtist(item) {
  if (item.artist) return item.artist;

  if (Array.isArray(item.artists)) {
    return item.artists
      .map(artist => typeof artist === "string" ? artist : artist.name)
      .filter(Boolean)
      .join(", ");
  }

  return "Spotify";
}

function renderList(id, items, formatter) {
  const container = $(id);
  container.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No data available.";
    container.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const formatted = formatter(item);

    const row = document.createElement("div");
    row.className = "list-item";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const info = document.createElement("div");
    info.className = "item-info";

    const title = document.createElement("strong");
    title.textContent = formatted.title || "Unknown";

    const subtitle = document.createElement("span");
    subtitle.textContent = formatted.subtitle || "";

    info.append(title, subtitle);
    row.append(rank, info);
    container.appendChild(row);
  });
}

// ========================================
// STORY DESIGN
// ========================================

function drawStory(data) {
  const canvas = $("story-canvas");
  const ctx = canvas.getContext("2d");

  const W = 1080;
  const H = 1920;

  ctx.clearRect(0, 0, W, H);

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#111411");
  bg.addColorStop(.5, "#090909");
  bg.addColorStop(1, "#141414");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Green glow
  const glow = ctx.createRadialGradient(
    850, 250, 20,
    850, 250, 700
  );

  glow.addColorStop(0, "rgba(199,255,101,.13)");
  glow.addColorStop(1, "rgba(199,255,101,0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Brand
  ctx.fillStyle = "#c7ff65";
  ctx.font = "900 65px Arial";
  ctx.fillText("LUXX.", 76, 120);

  ctx.fillStyle = "#888";
  ctx.font = "20px Arial";
  ctx.fillText("PERSONAL LISTENING PROFILE", 80, 170);

  line(ctx, 80, 210, 1000, 210);

  // Title
  ctx.fillStyle = "#f3f3f3";
  ctx.font = "900 100px Arial";
  ctx.fillText("MY", 76, 355);
  ctx.fillText("LISTENING.", 76, 455);

  ctx.fillStyle = "#c7ff65";
  ctx.font = "22px Arial";
  ctx.fillText("A SNAPSHOT OF MY MUSIC WORLD", 82, 510);

  // Stats
  const user = data.user || {};

  const stats = [
    ["TOTAL PLAYS", user.totalPlays],
    ["ARTISTS", user.artistCount],
    ["TRACKS", user.trackCount],
    ["ALBUMS", user.albumCount]
  ];

  const positions = [
    [76, 590],
    [550, 590],
    [76, 790],
    [550, 790]
  ];

  stats.forEach((stat, index) => {
    const [x, y] = positions[index];

    roundedRect(ctx, x, y, 454, 160, 18, "#151815");
    roundedRect(ctx, x, y, 5, 160, 2, "#c7ff65");

    ctx.fillStyle = "#888";
    ctx.font = "19px Arial";
    ctx.fillText(stat[0], x + 30, y + 48);

    ctx.fillStyle = "#f3f3f3";
    ctx.font = "900 57px Arial";

    const value = Number(stat[1] || 0).toLocaleString("en-US");
    ctx.fillText(value, x + 30, y + 118);
  });

  // Top artists
  let sectionY = 1080;

  ctx.fillStyle = "#c7ff65";
  ctx.font = "bold 20px Arial";
  ctx.fillText("01 / TOP ARTISTS", 80, sectionY);

  ctx.fillStyle = "#f3f3f3";
  ctx.font = "bold 35px Arial";
  ctx.fillText("Artists on repeat.", 80, sectionY + 55);

  const artists = (data.topArtists || []).slice(0, 5);

  artists.forEach((artist, index) => {
    const y = sectionY + 110 + index * 62;

    ctx.fillStyle = "#777";
    ctx.font = "20px Arial";
    ctx.fillText(String(index + 1).padStart(2, "0"), 82, y);

    ctx.fillStyle = "#eee";
    ctx.font = "bold 23px Arial";
    ctx.fillText(
      truncate(ctx, artist.name || "Unknown", 780),
      145,
      y
    );

    if (index < artists.length - 1) {
      line(ctx, 145, y + 20, 1000, y + 20, "#262626");
    }
  });

  // Top tracks
  sectionY = 1570;

  ctx.fillStyle = "#c7ff65";
  ctx.font = "bold 20px Arial";
  ctx.fillText("02 / TOP TRACKS", 80, sectionY);

  const tracks = (data.topTracks || []).slice(0, 4);

  tracks.forEach((track, index) => {
    const y = sectionY + 60 + index * 58;

    ctx.fillStyle = "#777";
    ctx.font = "20px Arial";
    ctx.fillText(String(index + 1).padStart(2, "0"), 82, y);

    ctx.fillStyle = "#eee";
    ctx.font = "bold 22px Arial";
    ctx.fillText(
      truncate(ctx, track.name || "Unknown", 620),
      145,
      y
    );

    ctx.fillStyle = "#888";
    ctx.font = "17px Arial";
    ctx.fillText(
      truncate(ctx, getArtist(track), 300),
      1000,
      y,
      300
    );
  });

  // Footer
  line(ctx, 80, 1850, 1000, 1850);

  ctx.fillStyle = "#777";
  ctx.font = "18px Arial";
  ctx.fillText("MADE WITH LUXX LIVE LISTENING", 80, 1890);

  ctx.textAlign = "right";
  ctx.fillStyle = "#c7ff65";
  ctx.font = "bold 20px Arial";
  ctx.fillText("LUXX.MY.ID", 1000, 1890);
  ctx.textAlign = "left";
}

function line(ctx, x1, y1, x2, y2, color = "#333") {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundedRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function truncate(ctx, text, maxWidth) {
  let result = String(text || "");

  while (
    result.length > 0 &&
    ctx.measureText(result).width > maxWidth
  ) {
    result = result.slice(0, -1);
  }

  return result === text ? result : result.trimEnd() + "...";
}

// ========================================
// GENERATE PNG
// ========================================

async function generateStory() {
  if (!listeningData) return;

  $("share-button").disabled = true;
  $("share-button").textContent = "GENERATING...";

  try {
    drawStory(listeningData);

    storyBlob = await new Promise(resolve => {
      $("story-canvas").toBlob(resolve, "image/png");
    });

    if (!storyBlob) {
      throw new Error("Could not generate PNG");
    }

    $("story-preview").hidden = false;
    $("share-message").textContent =
      "Your Instagram Story is ready.";

  } catch (error) {
    $("share-message").textContent = error.message;
  } finally {
    $("share-button").disabled = false;
    $("share-button").textContent = "GENERATE STORY";
  }
}

// ========================================
// DOWNLOAD
// ========================================

function downloadStory() {
  if (!storyBlob) return;

  const url = URL.createObjectURL(storyBlob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "luxx-listening-story.png";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ========================================
// SHARE
// ========================================

async function shareStory() {
  if (!storyBlob) return;

  const file = new File(
    [storyBlob],
    "luxx-listening-story.png",
    { type: "image/png" }
  );

  if (
    navigator.canShare &&
    navigator.canShare({ files: [file] }) &&
    navigator.share
  ) {
    try {
      await navigator.share({
        files: [file],
        title: "My LUXX Listening Profile"
      });
    } catch (error) {
      if (error.name !== "AbortError") {
        $("share-message").textContent = error.message;
      }
    }
  } else {
    downloadStory();

    $("share-message").textContent =
      "Image downloaded. Upload it to Instagram Story.";
  }
}

// ========================================
// EVENTS
// ========================================

$("period").addEventListener("change", loadStats);
$("share-button").addEventListener("click", generateStory);
$("download-button").addEventListener("click", downloadStory);
$("native-share-button").addEventListener("click", shareStory);

loadStats();
