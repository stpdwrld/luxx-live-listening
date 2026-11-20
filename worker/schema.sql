
-- LUXX LISTENING ARCHIVE
-- Database: music

CREATE TABLE IF NOT EXISTS listening_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    track_id TEXT NOT NULL,
    track_name TEXT NOT NULL,
    artist_id TEXT,
    artist_name TEXT NOT NULL,
    album_id TEXT,
    album_name TEXT,
    image_url TEXT,
    spotify_url TEXT,

    played_at TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(track_id, played_at)
);

CREATE INDEX IF NOT EXISTS idx_history_played_at
ON listening_history(played_at);

CREATE INDEX IF NOT EXISTS idx_history_track
ON listening_history(track_id);

CREATE INDEX IF NOT EXISTS idx_history_artist
ON listening_history(artist_id);

CREATE INDEX IF NOT EXISTS idx_history_album
ON listening_history(album_id);


-- SPOTIFY OAUTH TOKEN STORAGE
CREATE TABLE IF NOT EXISTS spotify_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    encrypted_refresh_token TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
