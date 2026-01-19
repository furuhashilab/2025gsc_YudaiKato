export type ListenPost = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  played_at: string;        // ISO
  duration_ms: number;
  lat: number;
  lng: number;
  // mood は後で
};

export type ListenRecord = ListenPost & {
  id: string;               // uuid-ish
  created_at: string;       // ISO
};

export type RecentItem = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  played_at: string;
  duration_ms: number;
};

export type RecentResponse =
  | { ok: true; items: RecentItem[] }
  | { ok: false; error: string; status: number };

export type ListenItem = {
  id: string;
  spotify_track_id: string;
  played_at: string;
  spotify_played_at: string | null;
  title: string;
  artist: string;
  album_image_url: string | null;
  duration_ms: number;
  mood: string | null;
  mood_note?: string | null;
};

export type ListenResponse =
  | { ok: true; items: ListenItem[] }
  | { ok: false; error: string; status: number };
