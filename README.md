# LUXX Live Listening

A public, read-only live listening page powered by Pano Scrobbler → Last.fm → Cloudflare Workers.

## How it works

1. Pano Scrobbler detects the Android media session and sends Now Playing/scrobbles to Last.fm.
2. The Worker calls Last.fm `user.getRecentTracks`.
3. If the returned track has `@attr.nowplaying = "true"`, the page shows LIVE and the track details.
4. Otherwise, the page shows OFFLINE.
5. The browser checks the Worker every 15 seconds.

GitHub Actions deploys the Worker whenever code is pushed to `main`. It is the deployment pipeline; it does not need to poll Last.fm.

## 1. Configure Cloudflare secrets

In Cloudflare Dashboard → Workers & Pages → `luxx-live-listening` → Settings → Variables and Secrets, add these as **Secrets**:

- `LASTFM_API_KEY`: your newly rotated Last.fm API key
- `LASTFM_USER`: your exact Last.fm username

Do not put API keys in the repository, HTML, JavaScript, or `wrangler.jsonc`.

For local development, copy `.env.example` to `.dev.vars`, fill in values, and run `npm install && npm run dev`. `.dev.vars` is ignored by Git.

## 2. Configure GitHub Actions

In GitHub repository → Settings → Secrets and variables → Actions, add:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permission to edit/deploy Workers
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID

Push to `main`; the workflow deploys the Worker and the `public/` site together.

## 3. Test

- `https://YOUR-WORKER.workers.dev/api/health`
- `https://YOUR-WORKER.workers.dev/api/now-playing`
- Open the Worker root URL for the website.

## Notes

- Last.fm's `user.getRecentTracks` exposes the current track with `@attr.nowplaying="true"` when the user is listening.
- The Last.fm profile/scrobbling data must be publicly readable.
- Pano must have notification/media access as required by Android, and Last.fm scrobbling must be enabled.
- The site shows OFFLINE when Last.fm does not report a current Now Playing track. It does not play or relay audio.
- The browser polls every 15 seconds. Last.fm API usage should remain reasonable.
