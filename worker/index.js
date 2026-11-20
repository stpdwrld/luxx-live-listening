export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
    }

    if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
      return new Response(JSON.stringify({ online: false, error: "Worker secrets are not configured" }), { headers: cors });
    }

    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.search = new URLSearchParams({
      method: "user.getrecenttracks",
      user: env.LASTFM_USER,
      api_key: env.LASTFM_API_KEY,
      format: "json",
      limit: "1"
    });

    try {
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Last.fm returned ${response.status}`);
      const data = await response.json();
      const track = data?.recenttracks?.track?.[0];
      const isPlaying = track?.["@attr"]?.nowplaying === "true";

      const result = isPlaying && track ? {
        online: true,
        title: track.name || "Unknown track",
        artist: track.artist?.["#text"] || "Unknown artist",
        album: track.album?.["#text"] || "",
        image: track.image?.find(item => item.size === "extralarge")?.["#text"]
          || track.image?.find(item => item.size === "large")?.["#text"] || ""
      } : { online: false };

      return new Response(JSON.stringify(result), { headers: cors });
    } catch (error) {
      return new Response(JSON.stringify({ online: false, error: "Unable to retrieve listening status" }), {
        status: 502, headers: cors
      });
    }
  }
};

