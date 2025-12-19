"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type ListenItem = {
  id: string;
  spotify_track_id: string;
  played_at: string;
  mood: string | null;
  mood_note?: string | null;
};

type ListenResponse =
  | { ok: true; items: ListenItem[] }
  | { ok: false; error: string; status: number };

async function fetchRecent(): Promise<RecentResponse> {
  const res = await fetch("/api/spotify/recent", { cache: "no-store" });
  if (res.status === 401) {
    return { ok: false, error: "未認証です。Spotify でログインしてください。", status: 401 };
  }
  if (!res.ok) {
    return { ok: false, error: `Failed to load recent tracks: ${res.status}`, status: res.status };
  }
  const data = (await res.json()) as { items?: RecentItem[] };
  return { ok: true, items: data.items ?? [] };
}

async function fetchListens(): Promise<ListenResponse> {
  const res = await fetch("/api/listens", { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: data?.error ?? `Failed to load listens: ${res.status}`,
      status: res.status,
    };
  }
  const data = (await res.json()) as { items?: ListenItem[] };
  return { ok: true, items: data.items ?? [] };
}

export default function Home() {
  const [recent, setRecent] = useState<RecentResponse | null>(null);
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const [pinnedMap, setPinnedMap] = useState<Map<string, ListenItem>>(new Map());

  const normalizeId = useCallback((id: string) => id.trim(), []);
  const lastTrackIdRef = useRef<string | null>(null);
  const POLL_INTERVAL_MS = 15000;

  const loadRecent = useCallback(async () => {
    const result = await fetchRecent();
    setRecent(result);
  }, []);

  const loadListens = useCallback(async () => {
    const result = await fetchListens();
    if (!result.ok) return;
    const next = new Set<string>();
    const nextMap = new Map<string, ListenItem>();
    result.items.forEach((it) => {
      const key = normalizeId(it.spotify_track_id);
      next.add(key);
      const existing = nextMap.get(key);
      if (!existing) {
        nextMap.set(key, it);
        return;
      }
      const existingTime = Date.parse(existing.played_at);
      const nextTime = Date.parse(it.played_at);
      if (!Number.isNaN(nextTime) && (Number.isNaN(existingTime) || nextTime > existingTime)) {
        nextMap.set(key, it);
      }
    });
    setPinnedSet(next);
    setPinnedMap(nextMap);
  }, []);

  useEffect(() => {
    loadRecent();
    loadListens();
  }, [loadRecent, loadListens]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadListens();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadListens]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let isPolling = false;

    const poll = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const res = await fetch("/api/spotify/currently-playing", {
          cache: "no-store",
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error("[page poll] failed", res.status, errText);
          return;
        }
        const data: {
          trackId: string;
          isPlaying: boolean;
        } | null = await res.json();

        if (!data || !data.trackId || !data.isPlaying) return;
        if (lastTrackIdRef.current === null) {
          lastTrackIdRef.current = data.trackId;
          return;
        }
        if (lastTrackIdRef.current === data.trackId) return;
        lastTrackIdRef.current = data.trackId;
        if (!cancelled) {
          await loadListens();
        }
      } catch (e) {
        console.error("[page poll] error", e);
      } finally {
        isPolling = false;
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [loadListens]);

  useEffect(() => {
    const onFocus = () => {
      loadListens();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadListens]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("listens-updated");
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "listens-updated") {
        loadListens();
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [loadListens]);

  if (!recent) {
    return (
      <main style={{ padding: 16, display: "grid", gap: 12 }}>
        <p>読み込み中...</p>
      </main>
    );
  }

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
        <TrackCard
          key={`${it.played_at}-${it.spotify_track_id}`}
          item={it}
          isPinned={pinnedSet.has(normalizeId(it.spotify_track_id))}
          listen={pinnedMap.get(normalizeId(it.spotify_track_id))}
          onUpdated={loadListens}
        />
      ))}
    </main>
  );
}
