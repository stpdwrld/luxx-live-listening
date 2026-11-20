const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
const COOKIE_NAME = "luxx_admin";
const SESSION_SECONDS = 8 * 60 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return base64url(new Uint8Array(signature));
}

async function createSession(env) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = await sign(String(expires), env.ADMIN_SESSION_SECRET);
  return `${expires}.${signature}`;
}

async function verifySession(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));

  if (!match) return false;

  const [expiresText, signature] = match[1].split(".");
  const expires = Number(expiresText);

  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = await sign(String(expires), env.ADMIN_SESSION_SECRET);

  try {
    const a = fromBase64url(signature);
    const b = fromBase64url(expected);

    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_SECONDS}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0`;
}

function checkOrigin(request, url) {
  return request.headers.get("Origin") === url.origin;
}

function imageFrom(track) {
  const images = Array.isArray(track?.image) ? track.image : [];
  const preferred = ["extralarge", "large", "medium", "small"];

  for (const size of preferred) {
    const found = images.find(item => item?.size === size && item?.["#text"]);
    if (found) return found["#text"];
  }

  return images.find(item => item?.["#text"])?.["#text"] || "";
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value["#text"] || value.name || "";
  }
  return "";
}

function offlineResponse() {
  return json({
    ok: true,
    status: "offline",
    isPlaying: false,
    track: null,
    lastUpdated: new Date().toISOString()
  });
}

async function nowPlaying(env) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
    return json({
      ok: false,
      error: "Last.fm belum dikonfigurasi."
    }, 503);
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
    headers: {
      "user-agent": "LUXX-Live-Listening/1.0 (Cloudflare Worker)"
    }
  });

  if (!upstream.ok) {
    return json({ ok: false, error: `Last.fm HTTP ${upstream.status}` }, 502);
  }

  const payload = await upstream.json();

  if (payload.error) {
    return json({
      ok: false,
      error: payload.message || "Last.fm API error"
    }, 502);
  }

  const raw = payload?.recenttracks?.track;
  const track = Array.isArray(raw) ? raw[0] : raw;
  const playing = track?.["@attr"]?.nowplaying === "true";

  if (!track || !playing) return offlineResponse();

  return json({
    ok: true,
    status: "online",
    isPlaying: true,
    track: {
      title: textValue(track.name),
      artist: textValue(track.artist),
      album: textValue(track.album),
      image: imageFrom(track),
      url: track.url || "",
      startedAt: new Date().toISOString()
    },
    lastUpdated: new Date().toISOString()
  });
}

async function lastfmRequest(env, params) {
  const url = new URL(LASTFM_ENDPOINT);

  url.search = new URLSearchParams({
    ...params,
    api_key: env.LASTFM_API_KEY,
    format: "json"
  }).toString();

  const response = await fetch(url.toString(), {
    headers: {
      "user-agent": "LUXX-Live-Listening/1.0 (Cloudflare Worker)"
    }
  });

  if (!response.ok) {
    throw new Error(`Last.fm HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.message || "Last.fm API error");
  }

  return data;
}

async function trackStats(env) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
    return json({
      ok: false,
      error: "Last.fm belum dikonfigurasi."
    }, 503);
  }

  const currentResponse = await nowPlaying(env);
  const current = await currentResponse.json();

  if (!current.ok) {
    return json(current, currentResponse.status);
  }

  if (!current.isPlaying || !current.track) {
    return json({
      ok: true,
      status: "offline",
      isPlaying: false,
      track: null,
      stats: null
    });
  }

  const { title, artist } = current.track;

  const [trackData, artistData, userData] = await Promise.all([
    lastfmRequest(env, {
      method: "track.getInfo",
      artist,
      track: title,
      username: env.LASTFM_USER
    }),

    lastfmRequest(env, {
      method: "artist.getInfo",
      artist,
      username: env.LASTFM_USER
    }),

    lastfmRequest(env, {
      method: "user.getInfo",
      user: env.LASTFM_USER
    })
  ]);

  return json({
    ok: true,
    status: "online",
    isPlaying: true,
    track: current.track,
    stats: {
      trackPlays: Number(
        trackData.track?.userplaycount || 0
      ),

      artistPlays: Number(
        artistData.artist?.stats?.userplaycount || 0
      ),

      totalScrobbles: Number(
        userData.user?.playcount || 0
      )
    },
    lastUpdated: new Date().toISOString()
  });
}


function statsArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function statsImage(images) {
  if (!Array.isArray(images)) return "";

  const preferred =
    images.find(item => item.size === "extralarge") ||
    images.find(item => item.size === "large") ||
    images.find(item => item.size === "medium");

  return preferred?.["#text"] || "";
}

async function listeningStats(env, period = "overall") {
  const allowedPeriods = [
    "overall",
    "7day",
    "1month",
    "3month",
    "6month",
    "12month"
  ];

  if (!allowedPeriods.includes(period)) {
    period = "overall";
  }

  if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
    return json({
      ok: false,
      error: "Last.fm belum dikonfigurasi."
    }, 503);
  }

  const common = {
    user: env.LASTFM_USER,
    period,
    limit: "10"
  };

  const [
    userData,
    trackData,
    albumData,
    artistData,
    recentData
  ] = await Promise.all([
    lastfmRequest(env, {
      method: "user.getInfo",
      user: env.LASTFM_USER
    }),

    lastfmRequest(env, {
      method: "user.getTopTracks",
      ...common
    }),

    lastfmRequest(env, {
      method: "user.getTopAlbums",
      ...common
    }),

    lastfmRequest(env, {
      method: "user.getTopArtists",
      ...common
    }),

    lastfmRequest(env, {
      method: "user.getRecentTracks",
      user: env.LASTFM_USER,
      limit: "10"
    })
  ]);

  const topTracks = statsArray(trackData.toptracks?.track)
    .map((item, index) => ({
      rank: index + 1,
      name: item.name || "Unknown track",
      artist: item.artist?.name || "Unknown artist",
      plays: Number(item.playcount || 0),
      image: statsImage(item.image),
      url: item.url || ""
    }));

  const topAlbums = statsArray(albumData.topalbums?.album)
    .map((item, index) => ({
      rank: index + 1,
      name: item.name || "Unknown album",
      artist: item.artist?.name || "Unknown artist",
      plays: Number(item.playcount || 0),
      image: statsImage(item.image),
      url: item.url || ""
    }));

  const topArtists = statsArray(artistData.topartists?.artist)
    .map((item, index) => ({
      rank: index + 1,
      name: item.name || "Unknown artist",
      plays: Number(item.playcount || 0),
      image: statsImage(item.image),
      url: item.url || ""
    }));

  const recentTracks = statsArray(recentData.recenttracks?.track)
    .map(item => ({
      name: item.name || "Unknown track",
      artist: item.artist?.["#text"] || item.artist?.name || "Unknown artist",
      album: item.album?.["#text"] || "",
      image: statsImage(item.image),
      url: item.url || "",
      nowPlaying: item["@attr"]?.nowplaying === "true",
      date: item.date?.["#text"] || ""
    }));

  return json({
    ok: true,
    period,
    user: {
      name: userData.user?.name || env.LASTFM_USER,
      totalScrobbles: Number(userData.user?.playcount || 0),
      artistCount: Number(userData.user?.artist_count || 0),
      trackCount: Number(userData.user?.track_count || 0),
      albumCount: Number(userData.user?.album_count || 0),
      url: userData.user?.url || ""
    },
    topTracks,
    topAlbums,
    topArtists,
    recentTracks,
    lastUpdated: new Date().toISOString()
  });
}

async function adminAPI(request, env, url) {
  if (request.method === "POST" && !checkOrigin(request, url)) {
    return json({ ok: false, error: "Invalid origin" }, 403);
  }

  if (url.pathname === "/api/admin/login") {
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
      return json({ ok: false, error: "Admin belum dikonfigurasi." }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Data login tidak valid." }, 400);
    }

    if (
      typeof body.username !== "string" ||
      typeof body.password !== "string" ||
      body.username !== env.ADMIN_USERNAME ||
      body.password !== env.ADMIN_PASSWORD
    ) {
      return json({ ok: false, error: "Username atau password salah." }, 401);
    }

    const token = await createSession(env);

    return json(
      { ok: true, message: "Login berhasil." },
      200,
      { "Set-Cookie": sessionCookie(token) }
    );
  }

  if (url.pathname === "/api/admin/logout") {
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!(await verifySession(request, env))) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    return json(
      { ok: true },
      200,
      { "Set-Cookie": clearCookie() }
    );
  }

  if (
    url.pathname === "/api/admin/status" &&
    (request.method === "GET" || request.method === "POST")
  ) {
    if (!(await verifySession(request, env))) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (request.method === "GET") {
      const mode = await env.PRESENCE.get("manual_status");
      return json({
        ok: true,
        mode: mode === "offline" ? "offline" : "auto"
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Data tidak valid." }, 400);
    }

    if (body.status === "offline") {
      await env.PRESENCE.put("manual_status", "offline");
    } else if (body.status === "auto") {
      await env.PRESENCE.delete("manual_status");
    } else {
      return json({ ok: false, error: "Status tidak dikenal." }, 400);
    }

    return json({
      ok: true,
      mode: body.status
    });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/panel") {
      return Response.redirect(`${url.origin}/panel/`, 301);
    }

    if (url.pathname.startsWith("/api/admin/")) {
      try {
        return await adminAPI(request, env, url);
      } catch {
        return json({ ok: false, error: "Admin API error." }, 500);
      }
    }

    if (url.pathname === "/api/now-playing") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }

      try {
        const manual = await env.PRESENCE.get("manual_status");
        if (manual === "offline") return offlineResponse();
        return await nowPlaying(env);
      } catch {
        return json({
          ok: false,
          error: "Tidak bisa mengambil data saat ini."
        }, 502);
      }
    }
    
if (url.pathname === "/api/track-stats") {
  if (request.method !== "GET") {
    return json({
      ok: false,
      error: "Method not allowed"
    }, 405);
  }

  try {
    const manual = await env.PRESENCE.get("manual_status");

    if (manual === "offline") {
      return json({
        ok: true,
        status: "offline",
        isPlaying: false,
        track: null,
        stats: null
      });
    }

    return await trackStats(env);
  } catch {
    return json({
      ok: false,
      error: "Tidak bisa mengambil statistik Last.fm."
    }, 502);
  }
}

    // LISTENING STATS API
if (url.pathname === "/api/listening-stats") {
  if (request.method !== "GET") {
    return json({
      ok: false,
      error: "Method not allowed"
    }, 405);
  }

  try {
    const period = url.searchParams.get("period") || "overall";
    return await listeningStats(env, period);
  } catch (error) {
    return json({
      ok: false,
      error: "Tidak bisa mengambil statistik Last.fm."
    }, 502);
  }
}

// HEALTH
if (url.pathname === "/api/health") {
  return json({
    ok: true,
    service: "LUXX Live Listening"
  });
}

// STATS PAGE
if (
  url.pathname === "/stats" ||
  url.pathname === "/stats/"
) {
  return env.ASSETS.fetch(
    new Request(
      new URL("/stats.html", request.url),
      request
    )
  );
}

return env.ASSETS.fetch(request);
  }
};
