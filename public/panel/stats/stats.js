
const $ = id => document.getElementById(id);

let listeningData = null;
let storyBlob = null;
let selectedDesign = null;

const W = 1080;
const H = 1920;
const LIME = "#c7ff65";
const WHITE = "#f3f3f3";
const GREY = "#858585";
const DARK = "#090909";

const imageCache = new Map();

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

    $("share-button").disabled = !selectedDesign;
    $("loading").hidden = true;

  } catch (error) {
    $("loading").hidden = true;
    $("error").hidden = false;
    $("error").textContent = error.message;
  }
}

// ========================================
// RENDER STATS
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
      .map(artist =>
        typeof artist === "string" ? artist : artist.name
      )
      .filter(Boolean)
      .join(", ");
  }

  return "Spotify";
}

function renderList(id, items, formatter) {
  const container = $(id);
  container.replaceChildren();

  if (!Array.isArray(items) || !items.length) {
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
// IMAGE HELPERS
// ========================================

function getImageUrl(item) {
  if (!item) return "";

  if (item.images?.length) {
    return item.images[0].url || "";
  }

  if (item.album?.images?.length) {
    return item.album.images[0].url || "";
  }

  return "";
}

function getImage(url) {
  if (!url) return Promise.resolve(null);

  if (imageCache.has(url)) {
    return imageCache.get(url);
  }

  const promise = new Promise(resolve => {
    const img = new Image();

    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);

    img.src = url;
  });

  imageCache.set(url, promise);

  return promise;
}

async function drawCover(ctx, url, x, y, w, h) {
  roundedRect(ctx, x, y, w, h, 8, "#171717");

  const img = await getImage(url);

  if (img) {
    ctx.save();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.clip();

    const scale = Math.max(w / img.width, h / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;

    ctx.drawImage(
      img,
      x + (w - sw) / 2,
      y + (h - sh) / 2,
      sw,
      sh
    );

    ctx.restore();
  } else {
    ctx.fillStyle = "#252525";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = LIME;
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("LUXX.", x + w / 2, y + h / 2);
    ctx.textAlign = "left";
  }
}

// ========================================
// CANVAS HELPERS
// ========================================

function background(ctx) {
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, W, H);

  const gradient = ctx.createRadialGradient(
    850, 180, 10,
    850, 180, 900
  );

  gradient.addColorStop(0, "rgba(199,255,101,.09)");
  gradient.addColorStop(1, "rgba(199,255,101,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function header(ctx, edition) {
  ctx.fillStyle = LIME;
  ctx.font = "900 55px Arial";
  ctx.fillText("LUXX.", 76, 100);

  ctx.fillStyle = GREY;
  ctx.font = "18px Arial";
  ctx.textAlign = "right";
  ctx.fillText("LISTENING ARCHIVE", 1000, 88);
  ctx.fillText("PERSONAL PROFILE", 1000, 116);
  ctx.textAlign = "left";

  line(ctx, 76, 155, 1004, 155);

  ctx.fillStyle = LIME;
  ctx.font = "bold 19px Arial";
  ctx.fillText(edition.toUpperCase(), 80, 215);
}

function footer(ctx) {
  line(ctx, 76, 1815, 1004, 1815);

  ctx.fillStyle = GREY;
  ctx.font = "17px Arial";
  ctx.fillText("YOUR MUSIC. YOUR WORLD.", 80, 1860);

  ctx.fillStyle = LIME;
  ctx.font = "bold 19px Arial";
  ctx.textAlign = "right";
  ctx.fillText("LUXX.", 1000, 1860);
  ctx.textAlign = "left";
}

function line(ctx, x1, y1, x2, y2, color = "#303030") {
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

function fitText(ctx, text, maxWidth) {
  let value = String(text || "");

  while (
    value.length &&
    ctx.measureText(value).width > maxWidth
  ) {
    value = value.slice(0, -1);
  }

  return value.length < String(text || "").length
    ? value.trimEnd() + "…"
    : value;
}

function text(ctx, value, x, y, size = 22, color = WHITE, weight = "normal") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Arial`;
  ctx.fillText(String(value || ""), x, y);
}

function stat(ctx, label, value, x, y) {
  text(ctx, label, x, y, 16, GREY);
  text(
    ctx,
    Number(value || 0).toLocaleString("en-US"),
    x,
    y + 65,
    53,
    LIME,
    "bold"
  );
}

// ========================================
// ARTISTS DESIGN
// ========================================

async function drawArtists(ctx, data) {
  background(ctx);
  header(ctx, "01 / Artists Edition");

  const artists = (data.topArtists || []).slice(0, 5);
  const first = artists[0];

  text(ctx, "Top", 76, 355, 92, WHITE);
  text(ctx, "Artists.", 76, 450, 92, LIME, "bold");

  text(ctx, "THE ARTISTS THAT", 82, 510, 19, GREY);
  text(ctx, "SOUNDTRACK YOUR DAYS.", 82, 540, 19, GREY);

  if (first) {
    await drawCover(
      ctx,
      getImageUrl(first),
      590, 260, 410, 480
    );

    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(590, 620, 410, 120);

    text(ctx, "YOUR TOP ARTIST", 620, 675, 17, LIME);
    text(
      ctx,
      fitText(ctx, first.name, 350),
      620, 715, 31, WHITE, "bold"
    );
  }

  line(ctx, 76, 790, 1004, 790);

  artists.forEach((artist, i) => {
    const y = 870 + i * 155;

    text(ctx, String(i + 1).padStart(2, "0"), 80, y + 45, 22, GREY);

    drawCover(
      ctx,
      getImageUrl(artist),
      155, y, 100, 100
    );

    text(
      ctx,
      fitText(ctx, artist.name || "Unknown", 500),
      290, y + 43, 27, WHITE, "bold"
    );

    const genres = artist.genres?.slice(0, 2).join(" · ");
    text(ctx, genres || "Artist", 290, y + 77, 18, GREY);

    if (i < artists.length - 1) {
      line(ctx, 290, y + 115, 1000, y + 115);
    }
  });

  stat(
    ctx,
    "TOTAL ARTISTS",
    data.user?.artistCount,
    790, 1660
  );

  footer(ctx);
}

// ========================================
// ALBUMS DESIGN
// ========================================

async function drawAlbums(ctx, data) {
  background(ctx);
  header(ctx, "02 / Albums Edition");

  text(ctx, "Top", 76, 350, 92, WHITE);
  text(ctx, "Albums.", 76, 445, 92, LIME, "bold");

  text(ctx, "THE STORIES YOU", 82, 510, 19, GREY);
  text(ctx, "COLLECTED.", 82, 540, 19, GREY);

  const albums = (data.topAlbums || []).slice(0, 6);
  const positions = [
    [76, 650], [393, 650], [710, 650],
    [76, 1080], [393, 1080], [710, 1080]
  ];

  for (let i = 0; i < albums.length; i++) {
    const album = albums[i];
    const [x, y] = positions[i];

    await drawCover(
      ctx,
      getImageUrl(album),
      x, y, 270, 270
    );

    text(ctx, String(i + 1).padStart(2, "0"), x, y + 310, 17, LIME);

    text(
      ctx,
      fitText(ctx, album.name || "Unknown", 265),
      x, y + 350, 23, WHITE, "bold"
    );

    text(
      ctx,
      fitText(ctx, getArtist(album), 265),
      x, y + 382, 17, GREY
    );
  }

  line(ctx, 76, 1540, 1004, 1540);

  stat(ctx, "TOTAL ALBUMS", data.user?.albumCount, 80, 1640);

  footer(ctx);
}

// ========================================
// TRACKS DESIGN
// ========================================

async function drawTracks(ctx, data) {
  background(ctx);
  header(ctx, "03 / Tracks Edition");

  text(ctx, "Top", 76, 350, 92, WHITE);
  text(ctx, "Tracks.", 76, 445, 92, LIME, "bold");

  text(ctx, "THE SONGS THAT", 82, 510, 19, GREY);
  text(ctx, "KEPT YOU GOING.", 82, 540, 19, GREY);

  const tracks = (data.topTracks || []).slice(0, 7);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const y = 650 + i * 160;

    text(ctx, String(i + 1).padStart(2, "0"), 80, y + 65, 23, LIME);

    await drawCover(
      ctx,
      getImageUrl(track),
      155, y, 112, 112
    );

    text(
      ctx,
      fitText(ctx, track.name || "Unknown", 580),
      310, y + 43, 27, WHITE, "bold"
    );

    text(
      ctx,
      fitText(ctx, getArtist(track), 580),
      310, y + 80, 19, GREY
    );

    if (i < tracks.length - 1) {
      line(ctx, 310, y + 125, 1000, y + 125);
    }
  }

  stat(ctx, "TOTAL TRACKS", data.user?.trackCount, 790, 1640);

  footer(ctx);
}

// ========================================
// COMPLETE PROFILE DESIGN
// ========================================

async function drawComplete(ctx, data) {
  background(ctx);
  header(ctx, "04 / Complete Profile");

  text(ctx, "My Music.", 76, 350, 90, WHITE);
  text(ctx, "My World.", 76, 450, 90, LIME, "bold");

  text(ctx, "ARTISTS. ALBUMS. TRACKS.", 82, 520, 19, GREY);
  text(ctx, "ALL IN ONE.", 82, 550, 19, GREY);

  const user = data.user || {};

  const values = [
    ["PLAYS", user.totalPlays],
    ["ARTISTS", user.artistCount],
    ["TRACKS", user.trackCount],
    ["ALBUMS", user.albumCount]
  ];

  const xPositions = [80, 315, 550, 785];

  values.forEach((item, i) => {
    const x = xPositions[i];

    text(ctx, item[0], x, 700, 16, GREY);

    text(
      ctx,
      Number(item[1] || 0).toLocaleString("en-US"),
      x,
      770,
      43,
      LIME,
      "bold"
    );

    if (i < 3) {
      line(ctx, x + 190, 660, x + 190, 800);
    }
  });

  line(ctx, 76, 850, 1004, 850);

  const artist = data.topArtists?.[0];
  const album = data.topAlbums?.[0];
  const track = data.topTracks?.[0];

  const cards = [
    {
      label: "TOP ARTIST",
      item: artist,
      name: artist?.name,
      image: getImageUrl(artist),
      artist: ""
    },
    {
      label: "TOP ALBUM",
      item: album,
      name: album?.name,
      image: getImageUrl(album),
      artist: album ? getArtist(album) : ""
    },
    {
      label: "TOP TRACK",
      item: track,
      name: track?.name,
      image: getImageUrl(track),
      artist: track ? getArtist(track) : ""
    }
  ];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const x = 76 + i * 315;

    text(ctx, card.label, x, 930, 17, GREY);

    await drawCover(
      ctx,
      card.image,
      x, 990, 270, 270
    );

    text(
      ctx,
      fitText(ctx, card.name || "No data", 260),
      x, 1310, 24, WHITE, "bold"
    );

    text(
      ctx,
      fitText(ctx, card.artist || "LUXX", 260),
      x, 1345, 17, GREY
    );
  }

  line(ctx, 76, 1430, 1004, 1430);

  text(ctx, "YOUR LISTENING PROFILE", 80, 1500, 18, LIME);
  text(ctx, "A collection of your musical world.", 80, 1550, 26, WHITE);

  footer(ctx);
}

// ========================================
// GENERATE STORY
// ========================================

async function drawStory(data, design) {
  const canvas = $("story-canvas");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, W, H);

  if (design === "artists") {
    await drawArtists(ctx, data);
  } else if (design === "albums") {
    await drawAlbums(ctx, data);
  } else if (design === "tracks") {
    await drawTracks(ctx, data);
  } else {
    await drawComplete(ctx, data);
  }
}

async function generateStory() {
  if (!listeningData || !selectedDesign) return;

  $("share-button").disabled = true;
  $("share-button").textContent = "GENERATING...";
  $("story-preview").hidden = true;
  $("share-message").textContent = "";

  try {
    await drawStory(listeningData, selectedDesign);

    storyBlob = await new Promise(resolve => {
      $("story-canvas").toBlob(resolve, "image/png");
    });

    if (!storyBlob) {
      throw new Error("Could not generate PNG");
    }

    $("story-preview").hidden = false;
    $("share-message").textContent =
      "Your LUXX Story is ready.";

  } catch (error) {
    $("share-message").textContent =
      "Could not generate story: " + error.message;
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
  link.download = `luxx-${selectedDesign}-story.png`;

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
    `luxx-${selectedDesign}-story.png`,
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

document.querySelectorAll(".design-option").forEach(button => {
  button.addEventListener("click", () => {
    selectedDesign = button.dataset.design;

    document.querySelectorAll(".design-option").forEach(option => {
      option.setAttribute(
        "aria-pressed",
        String(option === button)
      );
    });

    $("share-button").disabled = !listeningData;
    $("story-preview").hidden = true;
    storyBlob = null;
    $("share-message").textContent = "";
  });
});

$("period").addEventListener("change", loadStats);
$("share-button").addEventListener("click", generateStory);
$("download-button").addEventListener("click", downloadStory);
$("native-share-button").addEventListener("click", shareStory);

loadStats();
