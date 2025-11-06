import { cookies } from "next/headers";
import { TrackCard } from "@/components/TrackCard";

type RecentItem = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  played_at: string;
  duration_ms: number;
};

type RecentResponse =
  | { ok: true; items: RecentItem[] }
  | { ok: false; error: string; status: number };

async function fetchRecent(): Promise<RecentResponse> {
  const cookieHeader = cookies().toString();

  const res = await fetch("http://127.0.0.1:3000/api/spotify/recent", {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (res.status === 401) {
    return { ok: false, error: "未認証です。Spotify でログインしてください。", status: 401 };
  }

  if (!res.ok) {
    return { ok: false, error: `Failed to load recent tracks: ${res.status}`, status: res.status };
  }

  const data = (await res.json()) as { items?: RecentItem[] };
  return { ok: true, items: data.items ?? [] };
}

export default async function Home() {
  const recent = await fetchRecent();

  if (!recent.ok) {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Music Walk Map</h1>
        <div
          role="alert"
          style={{
            padding: 16,
            borderRadius: 8,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            color: "#842029",
          }}
        >
          {recent.error}
          {recent.status === 401 && (
            <>
              {" "}
              <a href="/api/spotify/login" style={{ textDecoration: "underline" }}>
                Spotify でログイン
              </a>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 16, display: "grid", gap: 12 }}>
      {recent.items.map((it) => (
        <TrackCard key={`${it.played_at}-${it.spotify_track_id}`} item={it} />
      ))}
    </main>
  );
}
