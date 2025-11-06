"use client";

import { useState } from "react";
import { toast } from "@/utils/toast";
import { MoodPicker, type Mood } from "./MoodPicker";

type TrackCardProps = {
  item: {
    spotify_track_id: string;
    title: string;
    artist: string;
    album_image_url: string | null;
    played_at: string;
    duration_ms: number;
  };
};

export function TrackCard({ item }: TrackCardProps) {
  const [mood, setMood] = useState<Mood>("soso");
  const [moodNote, setMoodNote] = useState("");

  async function handlePin() {
    if (!("geolocation" in navigator)) {
      toast("このブラウザでは位置情報が使えません");
      return;
    }

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const res = await fetch("/api/listens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          spotify_track_id: item.spotify_track_id,
          title: item.title,
          artist: item.artist,
          album_image_url: item.album_image_url,
          played_at: item.played_at,
          duration_ms: item.duration_ms,
          lat,
          lng,
          mood,
          mood_note: mood === "other" ? moodNote : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast(json.error ?? "保存に失敗しました…");
      } else {
        toast("保存しました 🎧");
      }
    } catch (err: any) {
      if (err?.code === err?.PERMISSION_DENIED) {
        toast("位置情報の許可が必要です");
      } else {
        toast(err?.message ?? "位置情報の取得または保存に失敗しました");
      }
    }
  }

  const playedLocal = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.played_at));
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
        display: "grid",
        gridTemplateRows: "auto 1fr",
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

      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        <div>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 4px",
              lineHeight: 1.3,
              color: "#111",
            }}
          >
            {item.title}
          </h2>
          <p style={{ margin: 0, color: "#666" }}>{item.artist}</p>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#777" }}>
            再生: {playedLocal}（{durationMin}:{durationSec}）
          </p>
        </div>

        <div>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "#555" }}>Mood を選択</p>
          <MoodPicker value={mood} note={moodNote} onChange={setMood} onNoteChange={setMoodNote} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handlePin}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#f8fafc",
              cursor: "pointer",
              color: "#000",
            }}
          >
            現在地にピン
          </button>
          <a
            href="/map"
            style={{
              textDecoration: "underline",
              color: "#2563eb",
              fontWeight: 600,
            }}
          >
            地図を開く
          </a>
        </div>
      </div>
    </article>
  );
}
