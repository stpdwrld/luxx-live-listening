const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff"
    }
  });
}

function imageFrom(track) {
  const images = Array.isArray(track?.image) ? track.image : [];
  const preferred = ["extralarge", "large", "medium", "small"];
  for (const size of preferred) {
    const found = images.find((item) => item?.size === size && item?.["#text"]);
    if (found) return found["#text"];
  }
  return images.find((item) => item?.["#text"])?.["#text"] || "";
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value["#text"] || value.name || "";
  return "";
}

async function nowPlaying(env) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
    return json({ ok: false, error: "Worker belum dikonfigurasi. Isi LASTFM_API_KEY dan LASTFM_USER di Cloudflare Secrets." }, 503);
  }

  const url = new URL(LASTFM_ENDPOINT);
  url.search = new URLSearchParams({
    method: "user.getRecentTracks",
    user: env.LASTFM_USER,
    api_key: env.LASTFM_API_KEY,
    format: "json",
    limit: "1"
  }).toString();

  const upstream = await fetch(url.toString(), {
    headers: { "user-agent": "LUXX-Live-Listening/1.0 (Cloudflare Worker)" }
  });

  if (!upstream.ok) {
    return json({ ok: false, error: `Last.fm returned HTTP ${upstream.status}` }, 502);
  }

  const payload = await upstream.json();
  if (payload.error) {
    return json({ ok: false, error: payload.message || "Last.fm API error", code: payload.error }, 502);
  }

  const raw = payload?.recenttracks?.track;
  const track = Array.isArray(raw) ? raw[0] : raw;
  const playing = Boolean(track?.["@attr"]?.nowplaying === "true");

  if (!track || !playing) {
    return json({
      ok: true,
      status: "offline",
      isPlaying: false,
      track: null,
      lastUpdated: new Date().toISOString()
    });
  }

  const artist = textValue(track.artist) || textValue(track?.["artist"]);
  const album = textValue(track.album);
  const title = textValue(track.name);

  return json({
    ok: true,
    status: "online",
    isPlaying: true,
    track: {
      title,
      artist,
      album,
      image: imageFrom(track),
      url: track.url || "",
      startedAt: new Date().toISOString()
    },
    lastUpdated: new Date().toISOString()
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/now-playing") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      try {
        return await nowPlaying(env);
      } catch (error) {
        return json({ ok: false, error: "Tidak bisa mengambil data Last.fm saat ini." }, 502);
      }
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "LUXX Live Listening" });
    }

    return env.ASSETS.fetch(request);
  }
};
