"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TrackCard } from "@/components/TrackCard";
import type { ListenItem, ListenResponse, RecentItem, RecentResponse } from "@/types/listen";

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
  const SAVE_LOCK_KEY = "mwm-last-saved";

  const [recent, setRecent] = useState<RecentResponse | null>(null);
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const [pinnedMap, setPinnedMap] = useState<Map<string, ListenItem>>(new Map());
  const [listensReady, setListensReady] = useState(false);
  const pinnedSetRef = useRef<Set<string>>(new Set());
  const pinnedMapRef = useRef<Map<string, ListenItem>>(new Map());
  const lastSavedTrackRef = useRef<Map<string, string>>(new Map());

  const normalizeId = useCallback((id: string) => id.trim(), []);
  const normalizeDateStr = useCallback((value: string) => {
    const trimmed = value?.trim?.() ?? "";
    const t = Date.parse(trimmed);
    if (Number.isNaN(t)) return trimmed;
    const rounded = Math.round(t / 1000) * 1000; // 秒単位に丸めてキーを安定化
    return new Date(rounded).toISOString();
  }, []);
  const buildPinnedKey = useCallback(
    (trackId: string, spotifyPlayedAt: string) =>
      `${normalizeId(trackId)}-${normalizeDateStr(spotifyPlayedAt)}`,
    [normalizeDateStr, normalizeId],
  );
  const hasNearbyListen = useCallback(
    (trackId: string, playedAtIso: string, thresholdMs = 60000) => {
      const targetTs = Date.parse(playedAtIso);
      if (!Number.isFinite(targetTs)) return false;
      const normId = normalizeId(trackId);
      for (const listen of pinnedMapRef.current.values()) {
        if (!listen.spotify_track_id) continue;
        if (normalizeId(listen.spotify_track_id) !== normId) continue;
        const ts = Date.parse(listen.spotify_played_at ?? listen.played_at);
        if (!Number.isFinite(ts)) continue;
        if (Math.abs(ts - targetTs) <= thresholdMs) return true;
      }
      return false;
    },
    [normalizeId],
  );
  const currentTrackStartRef = useRef<{ trackId: string; startIso: string } | null>(null);
  const lastSavedRecentKeyRef = useRef<string | null>(null);
  const savingRecentKeyRef = useRef<string | null>(null);
  const POLL_INTERVAL_MS = 15000;
  const loadListens = useCallback(async () => {
    const result = await fetchListens();
    if (!result.ok) {
      console.error("[listens] fetch failed", result.status, result.error);
      return;
    }
    const next = new Set<string>();
    const nextMap = new Map<string, ListenItem>();
    result.items.forEach((it) => {
      if (!it.spotify_track_id) {
        return;
      }
      const spotifyPlayedAt = normalizeDateStr(it.spotify_played_at ?? it.played_at ?? "");
      if (!spotifyPlayedAt) {
        return;
      }
      const key = buildPinnedKey(it.spotify_track_id, spotifyPlayedAt);
      next.add(key);
      nextMap.set(key, it);
    });
    setPinnedSet(next);
    setPinnedMap(nextMap);
    pinnedSetRef.current = next;
    pinnedMapRef.current = nextMap;
    setListensReady(true);
  }, [buildPinnedKey]);

  const refreshListens = useCallback(() => {
    void loadListens();
  }, [loadListens]);

  const saveWithGeolocation = useCallback(
    async (
      payload: {
        spotify_track_id: string;
        title: string;
        artist: string;
        album_image_url: string | null;
        played_at: string;
        spotify_played_at: string;
        duration_ms: number;
      },
      key: string,
      label: "recent" | "current",
      newRecentItem?: RecentItem,
    ): Promise<boolean> => {
      const normalizedSpotifyAt = normalizeDateStr(payload.spotify_played_at);
      const normalizedPlayedAt = normalizeDateStr(payload.played_at);
      const lastSavedForTrack = lastSavedTrackRef.current.get(payload.spotify_track_id);
      const durationMs =
        typeof payload.duration_ms === "number" && Number.isFinite(payload.duration_ms)
          ? payload.duration_ms
          : 0;
      const trackWindowMs = durationMs + 30000;
      if (lastSavedForTrack) {
        const prevTs = Date.parse(lastSavedForTrack);
        const nextTs = Date.parse(normalizedSpotifyAt);
        if (
          Number.isFinite(prevTs) &&
          Number.isFinite(nextTs) &&
          Math.abs(prevTs - nextTs) < trackWindowMs
        ) {
          return false;
        }
      }

      // タブ間重複防止: localStorage で直近保存キーを共有
      try {
        const now = Date.now();
        const windowMs = Math.max(trackWindowMs, 120000); // 曲長+30秒か最低2分
        const raw = localStorage.getItem(SAVE_LOCK_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { key?: string; ts?: number; trackId?: string };
          if (
            parsed?.trackId === payload.spotify_track_id &&
            typeof parsed?.ts === "number" &&
            now - parsed.ts < windowMs
          ) {
            return false;
          }
          if (parsed?.key === key && typeof parsed?.ts === "number" && now - parsed.ts < windowMs) {
            return false;
          }
        }
      } catch (e) {
        // 失敗しても続行
      }

      if (savingRecentKeyRef.current === key) return false;
      if (lastSavedRecentKeyRef.current === key) return false;
      if (pinnedSetRef.current.has(key)) {
        lastSavedRecentKeyRef.current = key;
        return false;
      }
      if (hasNearbyListen(payload.spotify_track_id, payload.spotify_played_at)) return false;
      if (!("geolocation" in navigator)) return false;

      savingRecentKeyRef.current = key;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
          }),
        );

        const res = await fetch("/api/listens", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...payload,
            played_at: normalizedPlayedAt,
            spotify_played_at: normalizedSpotifyAt,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !(json as any)?.ok) {
          console.error("[recent save] failed", res.status, (json as any)?.error);
          return false;
        }
        lastSavedRecentKeyRef.current = key;
        lastSavedTrackRef.current.set(payload.spotify_track_id, normalizedSpotifyAt);
        try {
          localStorage.setItem(
            SAVE_LOCK_KEY,
            JSON.stringify({
              key,
              trackId: payload.spotify_track_id,
              ts: Date.now(),
            }),
          );
        } catch {
          // ignore
        }
        await loadListens();
        if (newRecentItem) {
          setRecent((prev) => {
            if (!prev || !prev.ok) return prev;
            const exists = prev.items.some(
              (it) => buildPinnedKey(it.spotify_track_id, it.played_at) === key,
            );
            if (exists) return prev;
            return { ok: true, items: [newRecentItem, ...prev.items].slice(0, 50) };
          });
        }
        return true;
      } catch (e) {
        console.error("[recent save] error", e);
        return false;
      } finally {
        savingRecentKeyRef.current = null;
      }
    },
    [buildPinnedKey, hasNearbyListen, loadListens],
  );

  const loadRecent = useCallback(async () => {
    const result = await fetchRecent();
    setRecent(result);
  }, []);

  useEffect(() => {
    refreshListens();
    const timer = setInterval(refreshListens, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [POLL_INTERVAL_MS, refreshListens]);

  useEffect(() => {
    loadRecent().catch((e) => console.error("[recent] fetch error", e));
  }, [loadRecent]);

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
          progressMs: number;
          durationMs: number;
          title: string;
          artist: string;
          albumImageUrl: string | null;
        } | null = await res.json();

        if (!data || !data.trackId || !data.isPlaying) return;
        const computedStart = new Date(Date.now() - data.progressMs);
        const spotifyPlayedAt = normalizeDateStr(
          (currentTrackStartRef.current &&
            currentTrackStartRef.current.trackId === data.trackId &&
            currentTrackStartRef.current.startIso) ||
            new Date(Math.round(computedStart.getTime() / 1000) * 1000).toISOString(),
        );

        const key = buildPinnedKey(data.trackId, spotifyPlayedAt);
        currentTrackStartRef.current = { trackId: data.trackId, startIso: spotifyPlayedAt };

        if (!pinnedSetRef.current.has(key) && !hasNearbyListen(data.trackId, spotifyPlayedAt)) {
          await saveWithGeolocation(
            {
              spotify_track_id: data.trackId,
              title: data.title,
              artist: data.artist,
              album_image_url: data.albumImageUrl ?? null,
              played_at: spotifyPlayedAt,
              spotify_played_at: spotifyPlayedAt,
              duration_ms: data.durationMs,
            },
            key,
            "current",
            {
              spotify_track_id: data.trackId,
              title: data.title,
              artist: data.artist,
              album_image_url: data.albumImageUrl ?? null,
              played_at: spotifyPlayedAt,
              duration_ms: data.durationMs,
            },
          );
        }

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
  }, [buildPinnedKey, hasNearbyListen, loadListens, normalizeDateStr, saveWithGeolocation]);

  useEffect(() => {
    const onFocus = () => {
      refreshListens();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshListens]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("listens-updated");
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "listens-updated") {
        refreshListens();
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [refreshListens]);

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

  const mergedItems = (() => {
    const candidates: {
      key: string;
      item: RecentItem;
      listen?: ListenItem;
      playedAtMs: number;
    }[] = [];

    pinnedMap.forEach((listen) => {
      const playedAt = listen.spotify_played_at ?? listen.played_at;
      const key = buildPinnedKey(listen.spotify_track_id, playedAt);
      candidates.push({
        key,
        item: {
          spotify_track_id: listen.spotify_track_id,
          title: listen.title,
          artist: listen.artist,
          album_image_url: listen.album_image_url,
          played_at: playedAt,
          duration_ms: listen.duration_ms ?? 0,
        },
        listen,
        playedAtMs: Date.parse(playedAt),
      });
    });

    recent.items.forEach((it) => {
      const key = buildPinnedKey(it.spotify_track_id, it.played_at);
      const listen = pinnedMap.get(key);
      candidates.push({
        key,
        item: it,
        listen,
        playedAtMs: Date.parse(it.played_at),
      });
    });

    candidates.sort((a, b) => {
      const ta = Number.isFinite(a.playedAtMs) ? a.playedAtMs : 0;
      const tb = Number.isFinite(b.playedAtMs) ? b.playedAtMs : 0;
      return tb - ta;
    });

    const seen = new Set<string>();
    const unique: typeof candidates = [];
    for (const c of candidates) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      unique.push(c);
    }

    return unique;
  })();

  return (
    <main style={{ padding: 16, display: "grid", gap: 12 }}>
      {mergedItems.map(({ key, item, listen }) => (
        <TrackCard
          key={key}
          item={item}
          isPinned={pinnedSet.has(key)}
          listen={listen}
          onUpdated={loadListens}
        />
      ))}
    </main>
  );
}
