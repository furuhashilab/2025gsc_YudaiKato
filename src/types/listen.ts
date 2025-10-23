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
