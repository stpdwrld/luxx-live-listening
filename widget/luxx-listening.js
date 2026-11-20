// Replace this with your deployed Cloudflare Worker URL.
const LUXX_WORKER_URL = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";

async function updateLuxxListening() {
  const status = document.getElementById("luxx-status");
  const cover = document.getElementById("luxx-cover");
  const title = document.getElementById("luxx-title");
  const artist = document.getElementById("luxx-artist");
  const album = document.getElementById("luxx-album");

  try {
    const response = await fetch(LUXX_WORKER_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Worker request failed");
    const data = await response.json();

    if (data.online) {
      status.textContent = "LIVE";
      status.classList.add("is-live");
      title.textContent = data.title || "Unknown track";
      artist.textContent = data.artist || "Unknown artist";
      album.textContent = data.album || "";
      if (data.image) {
        cover.src = data.image;
        cover.hidden = false;
      } else {
        cover.hidden = true;
      }
    } else {
      status.textContent = "OFFLINE";
      status.classList.remove("is-live");
      title.textContent = "Currently not listening";
      artist.textContent = "—";
      album.textContent = "";
      cover.hidden = true;
    }
  } catch {
    status.textContent = "OFFLINE";
    status.classList.remove("is-live");
    title.textContent = "Currently not listening";
    artist.textContent = "—";
    album.textContent = "";
    cover.hidden = true;
  }
}

updateLuxxListening();
setInterval(updateLuxxListening, 20000);
