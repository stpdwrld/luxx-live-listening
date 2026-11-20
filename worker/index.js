const COOKIE_NAME = "luxx_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_AUTH = "https://accounts.spotify.com";

const ARTIST_IMAGE_CACHE_SECONDS = 30 * 24 * 60 * 60;

// ========================================
// RESPONSE
// ========================================

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(value) {
  const b = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}

// ========================================
// ADMIN SESSION
// ========================================

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return base64url(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(value)
    )
  );
}

async function createSession(env) {
  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({
      exp: Date.now() + SESSION_SECONDS * 1000
    }))
  );

  return payload + "." +
    await sign(payload, env.ADMIN_SESSION_SECRET);
}

async function verifySession(request, env) {
  const cookie = request.headers.get("Cookie") || "";

  const token = cookie.split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(COOKIE_NAME + "="))
    ?.slice(COOKIE_NAME.length + 1);

  if (!token) return false;

  const [payload, signature] = token.split(".");

  if (!payload || !signature) return false;

  const expected = await sign(
    payload,
    env.ADMIN_SESSION_SECRET
  );

  if (signature !== expected) return false;

  try {
    const data = JSON.parse(
      new TextDecoder().decode(
        fromBase64url(payload)
      )
    );

    return data.exp > Date.now();
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

// ========================================
// ENCRYPTION
// ========================================

async function encryptionKey(env) {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      env.SPOTIFY_TOKEN_ENCRYPTION_KEY
    )
  );

  return crypto.subtle.importKey(
    "raw",
    raw,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptToken(token, env) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(
    new Uint8Array(12)
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );

  return JSON.stringify({
    iv: base64url(iv),
    data: base64url(encrypted)
  });
}

async function decryptToken(value, env) {
  const saved = JSON.parse(value);
  const key = await encryptionKey(env);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64url(saved.iv)
    },
    key,
    fromBase64url(saved.data)
  );

  return new TextDecoder().decode(decrypted);
}

async function saveRefreshToken(token, env) {
  const encrypted = await encryptToken(token, env);

  await env.DB.prepare(`
    INSERT INTO spotify_auth (
      id,
      encrypted_refresh_token,
      updated_at
    )
    VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      updated_at = CURRENT_TIMESTAMP
  `).bind(encrypted).run();
}

// ========================================
// SPOTIFY TOKEN
// ========================================

async function getAccessToken(env) {
  const cached = await env.PRESENCE.get(
    "spotify_access_token"
  );

  if (cached) return cached;

  const saved = await env.DB.prepare(`
    SELECT encrypted_refresh_token
    FROM spotify_auth
    WHERE id = 1
  `).first();

  if (!saved?.encrypted_refresh_token) {
    throw new Error("Spotify belum terhubung");
  }

  const refreshToken = await decryptToken(
    saved.encrypted_refresh_token,
    env
  );

  const basic = btoa(
    `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
  );

  const response = await fetch(
    `${SPOTIFY_AUTH}/api/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description || "Spotify token gagal"
    );
  }

  if (data.refresh_token) {
    await saveRefreshToken(data.refresh_token, env);
  }

  await env.PRESENCE.put(
    "spotify_access_token",
    data.access_token,
    {
      expirationTtl: Math.max(
        60,
        data.expires_in - 60
      )
    }
  );

  return data.access_token;
}

async function spotifyFetch(path, env) {
  const token = await getAccessToken(env);

  const response = await fetch(
    `${SPOTIFY_API}${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (response.status === 204) return null;

  if (response.status === 401) {
    await env.PRESENCE.delete(
      "spotify_access_token"
    );
    throw new Error("Spotify authorization expired");
  }

  if (response.status === 429) {
    throw new Error("Spotify rate limit. Try again later.");
  }

  if (!response.ok) {
    throw new Error(
      `Spotify API error: ${response.status}`
    );
  }

  return response.json();
}

// ========================================
// TRACK FORMAT
// ========================================

function mapTrack(track) {
  if (!track) return null;

  const artists = track.artists || [];
  const album = track.album || {};

  return {
    id: track.id,
    title: track.name || "Unknown track",
    artist: artists.map(a => a.name).join(", "),
    album: album.name || "",
    image: album.images?.[0]?.url || "",
    url: track.external_urls?.spotify || "",
    duration: track.duration_ms || 0,
    artists
  };
}

// ========================================
// ARTIST IMAGES
// ========================================


async function attachArtistImages(artists, env) {
  if (!Array.isArray(artists) || !artists.length) {
    return artists || [];
  }

  return Promise.all(
    artists.map(async artist => {
      if (!artist.id) {
        return {
          ...artist,
          image: "",
          imageError: "MISSING_ARTIST_ID"
        };
      }

      // Versi cache baru agar cache kosong sebelumnya dilewati.
      const cacheKey = `spotify_artist_image_v3:${artist.id}`;

      try {
        const cached = await env.PRESENCE.get(cacheKey);

        if (cached) {
          return { ...artist, image: cached };
        }
      } catch (error) {
        console.error("Artist cache error:", error);
      }

      try {
        const data = await spotifyFetch(
          `/artists/${encodeURIComponent(artist.id)}`,
          env
        );

        const image = data?.images?.[0]?.url || "";

        if (image) {
          await env.PRESENCE.put(
            cacheKey,
            image,
            { expirationTtl: 2592000 }
          );

          return { ...artist, image, imageError: null };
        }

        return {
          ...artist,
          image: "",
          imageError: "SPOTIFY_RETURNED_NO_IMAGES"
        };

      } catch (error) {
        console.error(
          `Artist image error (${artist.name}):`,
          error
        );

        return {
          ...artist,
          image: "",
          imageError: error.message || "UNKNOWN_ERROR"
        };
      }
    })
  );
}

// ========================================
// NOW PLAYING
// ========================================

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
  const manual = await env.PRESENCE.get("manual_status");

  if (manual === "offline") {
    return offlineResponse();
  }

  const data = await spotifyFetch(
    "/me/player/currently-playing",
    env
  );

  // Tidak ada lagu yang sedang aktif.
  if (!data?.item) {
    return offlineResponse();
  }

  return json({
    ok: true,
    status: data.is_playing ? "online" : "paused",
    isPlaying: !!data.is_playing,
    track: mapTrack(data.item),
    progress: data.progress_ms || 0,
    lastUpdated: new Date().toISOString()
  });
}

// ========================================
// LISTENING HISTORY SYNC
// ========================================

async function syncRecentlyPlayed(env) {
  const last = await env.PRESENCE.get(
    "spotify_last_played"
  );

  const after = last
    ? Math.max(0, Number(last) - 60000)
    : null;

  const path = after
    ? `/me/player/recently-played?limit=50&after=${after}`
    : "/me/player/recently-played?limit=50";

  const data = await spotifyFetch(path, env);
  const items = data?.items || [];

  let newest = last ? Number(last) : 0;

  for (const entry of items.reverse()) {
    const track = entry.track;

    if (!track?.id || !entry.played_at) {
      continue;
    }

    const artists = track.artists || [];
    const album = track.album || {};
    const firstArtist = artists[0] || {};

    await env.DB.prepare(`
      INSERT OR IGNORE INTO listening_history (
        track_id,
        track_name,
        artist_id,
        artist_name,
        album_id,
        album_name,
        image_url,
        spotify_url,
        played_at,
        duration_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      track.id,
      track.name || "Unknown",
      firstArtist.id || null,
      firstArtist.name || "Unknown",
      album.id || null,
      album.name || "",
      album.images?.[0]?.url || "",
      track.external_urls?.spotify || "",
      entry.played_at,
      track.duration_ms || 0
    ).run();

    const timestamp = new Date(
      entry.played_at
    ).getTime();

    newest = Math.max(newest, timestamp);
  }

  if (newest) {
    await env.PRESENCE.put(
      "spotify_last_played",
      String(newest)
    );
  }

  return items.length;
}

// ========================================
// STATISTICS
// ========================================

function periodCutoff(period) {
  const days = {
    "7day": 7,
    "30day": 30,
    "90day": 90,
    "6month": 180
  }[period];

  if (!days) return null;

  return new Date(
    Date.now() - days * 86400000
  ).toISOString();
}

async function listeningStats(env, period) {
  const allowed = [
    "7day",
    "30day",
    "90day",
    "6month",
    "overall"
  ];

  if (!allowed.includes(period)) {
    period = "overall";
  }

  await syncRecentlyPlayed(env);

  const cutoff = periodCutoff(period);
  const where = cutoff
    ? "WHERE played_at >= ?"
    : "";

  const bind = cutoff ? [cutoff] : [];

  const totals = await env.DB.prepare(`
    SELECT
      COUNT(*) AS totalPlays,
      COUNT(DISTINCT artist_id) AS artistCount,
      COUNT(DISTINCT track_id) AS trackCount,
      COUNT(DISTINCT album_id) AS albumCount
    FROM listening_history
    ${where}
  `).bind(...bind).first();

  const topTracks = await env.DB.prepare(`
    SELECT
      track_id AS id,
      track_name AS name,
      artist_name AS artist,
      album_name AS album,
      image_url AS image,
      spotify_url AS url,
      COUNT(*) AS plays
    FROM listening_history
    ${where}
    GROUP BY track_id
    ORDER BY plays DESC
    LIMIT 10
  `).bind(...bind).all();

  const topArtists = await env.DB.prepare(`
    SELECT
      artist_id AS id,
      artist_name AS name,
      COUNT(*) AS plays
    FROM listening_history
    ${where}
    GROUP BY artist_id
    ORDER BY plays DESC
    LIMIT 10
  `).bind(...bind).all();

  // Add Spotify artist artwork.
  const artistsWithImages = await attachArtistImages(
    topArtists.results || [],
    env
  );

  const topAlbums = await env.DB.prepare(`
    SELECT
      album_id AS id,
      album_name AS name,
      artist_name AS artist,
      image_url AS image,
      COUNT(*) AS plays
    FROM listening_history
    ${where}
    GROUP BY album_id
    ORDER BY plays DESC
    LIMIT 10
  `).bind(...bind).all();

  const recent = await env.DB.prepare(`
    SELECT
      track_name AS name,
      artist_name AS artist,
      album_name AS album,
      image_url AS image,
      spotify_url AS url,
      played_at AS date
    FROM listening_history
    ${where}
    ORDER BY played_at DESC
    LIMIT 10
  `).bind(...bind).all();

  return json({
    ok: true,
    period,
    user: {
      name: "Spotify User",
      ...totals
    },
    topTracks: topTracks.results || [],
    topArtists: artistsWithImages,
    topAlbums: topAlbums.results || [],
    recentTracks: recent.results || [],
    lastUpdated: new Date().toISOString()
  });
}

// ========================================
// ADMIN API
// ========================================

async function adminAPI(request, url, env) {
  const path = url.pathname;

  if (
    path === "/api/admin/login" &&
    request.method === "POST"
  ) {
    if (!checkOrigin(request, url)) {
      return json(
        { ok: false, error: "Invalid origin" },
        403
      );
    }

    const body = await request.json();

    if (body.password !== env.ADMIN_PASSWORD) {
      return json(
        { ok: false, error: "Wrong password" },
        401
      );
    }

    const token = await createSession(env);

    return json(
      { ok: true },
      200,
      { "Set-Cookie": sessionCookie(token) }
    );
  }

  if (
    path === "/api/admin/logout" &&
    request.method === "POST"
  ) {
    return json(
      { ok: true },
      200,
      { "Set-Cookie": clearCookie() }
    );
  }

  if (!await verifySession(request, env)) {
    return json(
      { ok: false, error: "Unauthorized" },
      401
    );
  }

  if (path === "/api/admin/status") {
    if (request.method === "GET") {
      return json({
        ok: true,
        status:
          await env.PRESENCE.get("manual_status") ||
          "auto"
      });
    }

    if (request.method === "POST") {
      if (!checkOrigin(request, url)) {
        return json(
          { ok: false, error: "Invalid origin" },
          403
        );
      }

      const body = await request.json();

      const status = [
        "auto",
        "online",
        "offline"
      ].includes(body.status)
        ? body.status
        : "auto";

      await env.PRESENCE.put(
        "manual_status",
        status
      );

      return json({ ok: true, status });
    }
  }

  if (path === "/api/admin/spotify/connect") {
    const state = base64url(
      crypto.getRandomValues(new Uint8Array(24))
    );

    await env.PRESENCE.put(
      `spotify_oauth_state:${state}`,
      "valid",
      { expirationTtl: 600 }
    );

    const scope = [
      "user-read-playback-state",
      "user-read-currently-playing",
      "user-read-recently-played",
      "user-top-read"
    ].join(" ");

    const authUrl = new URL(
      `${SPOTIFY_AUTH}/authorize`
    );

    authUrl.search = new URLSearchParams({
      client_id: env.SPOTIFY_CLIENT_ID,
      response_type: "code",
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      scope,
      state
    });

    return json({
      ok: true,
      url: authUrl.toString()
    });
  }

  if (path === "/api/admin/spotify/status") {
    const saved = await env.DB.prepare(`
      SELECT id
      FROM spotify_auth
      WHERE id = 1
    `).first();

    return json({
      ok: true,
      connected: !!saved
    });
  }

  return json(
    { ok: false, error: "Not found" },
    404
  );
}

// ========================================
// SPOTIFY OAUTH CALLBACK
// ========================================

async function spotifyCallback(request, url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(
      "Spotify connection cancelled.",
      { status: 400 }
    );
  }

  if (!code || !state) {
    return new Response(
      "Missing OAuth parameters.",
      { status: 400 }
    );
  }

  const key = `spotify_oauth_state:${state}`;
  const valid = await env.PRESENCE.get(key);

  if (!valid) {
    return new Response(
      "Invalid or expired OAuth state.",
      { status: 403 }
    );
  }

  await env.PRESENCE.delete(key);

  const basic = btoa(
    `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
  );

  const response = await fetch(
    `${SPOTIFY_AUTH}/api/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.SPOTIFY_REDIRECT_URI
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.refresh_token) {
    return new Response(
      "Spotify authorization failed.",
      { status: 400 }
    );
  }

  await saveRefreshToken(
    data.refresh_token,
    env
  );

  await env.PRESENCE.put(
    "spotify_access_token",
    data.access_token,
    {
      expirationTtl: Math.max(
        60,
        data.expires_in - 60
      )
    }
  );

  return Response.redirect(
    new URL("/panel/?spotify=connected", url),
    302
  );
}

// ========================================
// MAIN WORKER
// ========================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/panel") {
        return Response.redirect(
          new URL("/panel/", url),
          301
        );
      }

      if (path.startsWith("/api/admin/")) {
        return adminAPI(request, url, env);
      }

      if (path === "/api/spotify/callback") {
        return spotifyCallback(request, url, env);
      }

      if (path === "/api/now-playing") {
        const manual = await env.PRESENCE.get(
          "manual_status"
        );

        if (manual === "offline") {
          return offlineResponse();
        }

        return await nowPlaying(env);
      }

      if (path === "/api/listening-stats") {
        const period =
          url.searchParams.get("period") || "overall";

        return await listeningStats(env, period);
      }

      if (path === "/api/sync-history") {
        await syncRecentlyPlayed(env);

        return json({ ok: true });
      }

      if (path === "/api/health") {
        return json({
          ok: true,
          service: "LUXX Live Listening",
          provider: "Spotify"
        });
      }

      if (path === "/stats" || path === "/stats/") {
        return env.ASSETS.fetch(
          new Request(
            new URL("/stats.html", url),
            request
          )
        );
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error("LUXX Worker:", error);

      return json({
        ok: false,
        error: error.message || "Internal server error"
      }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      syncRecentlyPlayed(env).catch(error => {
        console.error("Spotify sync:", error);
      })
    );
  }
};
