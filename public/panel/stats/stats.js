
const $ = id => document.getElementById(id);

let listeningData = null;

async function loadStats() {
  $("loading").hidden = false;
  $("error").hidden = true;
  $("share-button").disabled = true;

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
    subtitle: item.artist || item.artists?.join(", ") || "Track"
  }));

  renderList("top-albums", data.topAlbums, item => ({
    title: item.name,
    subtitle: item.artist || item.artists?.join(", ") || "Album"
  }));

  renderList("recent-tracks", data.recentTracks, item => ({
    title: item.name,
    subtitle: item.artist || item.artists?.join(", ") || "Recently played"
  }));
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

$("period").addEventListener("change", loadStats);

$("share-button").addEventListener("click", () => {
  $("share-message").textContent =
    "Story generator is the next step.";
});

loadStats();
