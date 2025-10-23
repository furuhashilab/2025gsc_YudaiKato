"use client";

import { useEffect, useMemo, useState } from "react";

type RecentItem = {
  spotify_track_id: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  played_at: string; // ISO
  duration_ms: number;
};

type ApiOk = { items: RecentItem[] };
type ApiErr = { error: string };

export default function Home() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetch("/api/spotify/recent", { cache: "no-store" });
        // 401なら未ログイン（またはトークン期限切れ）
        if (r.status === 401) {
          const j = (await r.json()) as ApiErr;
          throw new Error(j.error || "Not authenticated");
        }
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || `HTTP ${r.status}`);
        }
        const data = (await r.json()) as ApiOk;
        if (!cancelled) setItems(data.items ?? []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => "Music Walk Map", []);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{title}</h1>
      <p style={{ marginBottom: 16, color: "#555" }}>
        最近再生 50 件を表示します。未ログインの場合は
        <a href="/api/spotify/login" style={{ marginLeft: 6, textDecoration: "underline" }}>
          Spotify でログイン
        </a>
        してください。
      </p>

      {/* ローディング */}
      {loading && (
        <div style={{ padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
          読み込み中…
        </div>
      )}

      {/* エラー */}
      {!loading && err && (
        <div
          role="alert"
          style={{
            padding: 12,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            color: "#842029",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          エラー: {err === "Not authenticated" ? (
            <>
              未認証です。<a href="/api/spotify/login" style={{ textDecoration: "underline" }}>ログイン</a>してください。
            </>
          ) : (
            err
          )}
        </div>
      )}

      {/* 中身が空 */}
      {!loading && !err && items.length === 0 && (
        <div style={{ padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
          最近再生が見つかりません。Spotify で何か再生してから数分後に再読み込みしてください。
        </div>
      )}

      {/* カード一覧 */}
      <ul
        aria-label="recent tracks"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {items.map((it) => (
          <li key={`${it.spotify_track_id}-${it.played_at}`}>
            <TrackCard item={it} />
          </li>
        ))}
      </ul>
    </main>
  );
}

function TrackCard({ item }: { item: RecentItem }) {
  const d = new Date(item.played_at);
  // ユーザー環境のローカル時刻で表示（日本ならJSTになる）
  const playedLocal = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  const durationMin = Math.floor(item.duration_ms / 60000);
  const durationSec = Math.floor((item.duration_ms % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <article
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        background: "#fff",
      }}
    >
      {item.album_image_url ? (
        <img
          src={item.album_image_url}
          alt={`${item.title} - ${item.artist}`}
          width={400}
          height={400}
          style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: "100%",
            height: 160,
            background: "#f2f2f2",
            display: "grid",
            placeItems: "center",
            color: "#999",
          }}
        >
          No Image
        </div>
      )}
      <div style={{ padding: 12 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px", lineHeight: 1.3 }}>{item.title}</h2>
        <p style={{ margin: 0, color: "#666" }}>{item.artist}</p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#777" }}>
          再生: {playedLocal}（{durationMin}:{durationSec}）
        </p>

        {/* 後で「現在地にピン」ボタンをここに追加予定（M5） */}
      </div>
    </article>
  );
}
