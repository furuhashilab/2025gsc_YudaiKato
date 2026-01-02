"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Mood = "happy" | "soso" | "sad" | "other" | null;

type ListenItem = {
  id: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  played_at: string;
  lat: number;
  lng: number;
  mood: Mood;
  mood_note?: string | null;
  weather_main?: string | null;
  weather_description?: string | null;
  weather_temp_c?: number | null;
};

function colorByMood(m?: string | null) {
  switch (m) {
    case "happy":
      return "#10b981";
    case "soso":
      return "#f59e0b";
    case "sad":
      return "#ef4444";
    case "other":
      return "#8b5cf6";
    default:
      return "#9ca3af";
  }
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const markerMapRef = useRef<Record<string, maplibregl.Marker>>({});
  const openPopupRef = useRef<maplibregl.Popup | null>(null);
  const lastTrackRef = useRef<{
    trackId: string;
    title: string;
    artist: string;
    albumImageUrl: string | null;
    durationMs: number;
  } | null>(null);
  const didInitialFitRef = useRef(false);
  const [items, setItems] = useState<ListenItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const POLL_INTERVAL_MS = 15000;

  const [active, setActive] = useState<
    Record<Exclude<Mood, null>, boolean>
  >({
    happy: true,
    soso: true,
    sad: true,
    other: true,
  });

  const activeSet = useMemo(() => {
    const s = new Set<string>();
    Object.entries(active).forEach(([key, value]) => {
      if (value) s.add(key);
    });
    return s;
  }, [active]);

  const loadListens = useCallback(async () => {
    const res = await fetch("/api/listens", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "fetch failed");
    setItems((json.items ?? []) as ListenItem[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;

    const style: any = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    };

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: [139.7671, 35.6812],
        zoom: 11,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      (async () => {
        await loadListens();
        if (cancelled) return;
      })().catch((e) => setErr(String(e)));
    } catch (e: any) {
      setErr(e?.message ?? "Map init error");
    }

    return () => {
      cancelled = true;
      openPopupRef.current?.remove();
      openPopupRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      markerMapRef.current = {};
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [loadListens]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let isPolling = false;
    const channel =
      typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel("listens-updated")
        : null;

    const poll = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const res = await fetch("/api/spotify/currently-playing", {
          cache: "no-store",
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error("[poll] failed", res.status, errText);
          return;
        }
        const data: {
          trackId: string;
          title: string;
          artist: string;
          albumImageUrl: string | null;
          isPlaying: boolean;
          progressMs: number;
          durationMs: number;
        } | null = await res.json();

        if (!data || !data.trackId || !data.isPlaying) return;
        if (lastTrackRef.current === null) {
          lastTrackRef.current = {
            trackId: data.trackId,
            title: data.title,
            artist: data.artist,
            albumImageUrl: data.albumImageUrl,
            durationMs: data.durationMs,
          };
          return;
        }
        if (lastTrackRef.current.trackId === data.trackId) return;

        if (!navigator.geolocation) {
          console.error("[poll] geolocation not available");
          return;
        }

        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 0,
          });
        });

        const payload = {
          spotify_track_id: data.trackId,
          title: data.title,
          artist: data.artist,
          album_image_url: data.albumImageUrl,
          played_at: new Date().toISOString(),
          duration_ms: data.durationMs,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        const saveRes = await fetch("/api/listens", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!saveRes.ok) {
          const errText = await saveRes.text();
          console.error("[poll] save failed", saveRes.status, errText);
          return;
        }
        channel?.postMessage({ type: "listens-updated" });
        lastTrackRef.current = {
          trackId: data.trackId,
          title: data.title,
          artist: data.artist,
          albumImageUrl: data.albumImageUrl,
          durationMs: data.durationMs,
        };

        try {
          await loadListens();
        } catch (e: any) {
          if (!cancelled) {
            console.error("[poll] refresh failed", e?.message ?? e);
          }
        }
      } catch (e) {
        console.error("[poll] error", e);
      } finally {
        isPolling = false;
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      channel?.close();
    };
  }, [loadListens]);

  useEffect(() => {
    const onFocus = () => {
      loadListens().catch((e) => console.error("[focus] refresh failed", e));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadListens]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !items.length) return;

    // 既存マーカーを削除
    openPopupRef.current?.remove();
    openPopupRef.current = null;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    markerMapRef.current = {};

    const filtered = items.filter((it) => {
      const mood = it.mood ?? "other";
      return activeSet.has(mood);
    });

    if (!filtered.length) return;

    const bounds = new maplibregl.LngLatBounds();

    for (const it of filtered) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "16px",
        height: "16px",
        borderRadius: "9999px",
        background: colorByMood(it.mood),
        border: "2px solid white",
        boxShadow: "0 0 0 1px rgba(0,0,0,.2)",
      });

      const marker = new maplibregl.Marker({ element: el }).setLngLat([
        it.lng,
        it.lat,
      ]);

      const hasWeather = !!it.weather_main;
      const weatherTemp =
        typeof it.weather_temp_c === "number" &&
        Number.isFinite(it.weather_temp_c)
          ? `${it.weather_temp_c.toFixed(1)}℃`
          : "";
      const weatherDescription = it.weather_description
        ? ` (${it.weather_description})`
        : "";
      const weatherLine = hasWeather
        ? `天気: ${it.weather_main}${weatherDescription}${
            weatherTemp ? ` ${weatherTemp}` : ""
          }`
        : "天気: 取得なし";

      const popupHtml = `
        <div style="min-width:220px">
          ${
            it.album_image_url
              ? `<img src="${it.album_image_url}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:8px;"/>`
              : ""
          }
          <div style="margin-top:8px">
            <strong style="color:#0f172a">${it.title}</strong><br/>
            <span style="color:#1f2937">${it.artist}</span><br/>
            <span style="color:#777;font-size:12px">${new Date(
              it.played_at,
            ).toLocaleString()}</span><br/>
            ${
              it.mood
                ? `<span style="font-size:12px;color:#444">mood: ${
                    it.mood
                  }${
                    it.mood === "other" && it.mood_note
                      ? ` — ${it.mood_note}`
                      : ""
                  }</span>`
                : ""
            }
            <div style="font-size:12px;color:#444;margin-top:4px">${weatherLine}</div>
          </div>
        </div>`;
      const popup = new Popup({ offset: 12 }).setHTML(popupHtml);
      popup.on("open", () => {
        if (openPopupRef.current && openPopupRef.current !== popup) {
          openPopupRef.current.remove();
        }
        openPopupRef.current = popup;
      });
      popup.on("close", () => {
        if (openPopupRef.current === popup) {
          openPopupRef.current = null;
        }
      });
      marker.setPopup(popup).addTo(map);
      markersRef.current.push(marker);
      markerMapRef.current[it.id] = marker;
      bounds.extend([it.lng, it.lat]);
    }

    if (!didInitialFitRef.current) {
      if (filtered.length === 1) {
        map.flyTo({ center: [filtered[0].lng, filtered[0].lat], zoom: 14 });
      } else {
        map.fitBounds(bounds, { padding: 60 });
      }
      didInitialFitRef.current = true;
    }
  }, [items, activeSet]);

  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ヘッダー（そのまま） */}
      <header
        style={{
          padding: 12,
          borderBottom: "1px solid #eee",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <strong>Music Walk Map — MapLibre</strong>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 12,
            color: "#444",
            flexWrap: "wrap",
          }}
        >
          {([
            ["happy", "#10b981"],
            ["soso", "#f59e0b"],
            ["sad", "#ef4444"],
            ["other", "#8b5cf6"],
          ] as const).map(([key, color]) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={active[key as keyof typeof active]}
                onChange={(e) =>
                  setActive((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
              />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "9999px",
                    background: color,
                    border: "1px solid #fff",
                    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.2)",
                  }}
                />
                {key}
              </span>
            </label>
          ))}
        </div>
      </header>

      {err && (
        <div
          role="alert"
          style={{
            padding: 12,
            color: "#842029",
            background: "#f8d7da",
          }}
        >
          {err}
        </div>
      )}

      {/* ヘッダーの下を「地図＋リスト」の横並びにする */}
      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
        }}
      >
        {/* 地図エリア */}
        <div
          style={{
            flex: 1,
            position: "relative",
          }}
        >
          <div
            ref={containerRef}
            style={{
              position: "absolute",
              inset: 0,
            }}
          />
        </div>

        {/* 楽曲リストエリア（PC 想定） */}
        <aside
          style={{
            width: 320,
            maxWidth: "35%",
            borderLeft: "1px solid #e5e7eb",
            background: "rgba(255,255,255,0.9)",
            padding: 12,
            overflowY: "auto",
          }}
        >
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            保存された楽曲
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  background: "white",
                  borderRadius: 10,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  padding: 10,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
                onClick={() => {
                  const map = mapRef.current;
                  const marker = markerMapRef.current[it.id];
                  if (!map) return;
                  map.flyTo({
                    center: [it.lng, it.lat],
                    zoom: 14,
                    essential: true,
                  });
                  if (marker) {
                    const popup = marker.getPopup();
                    if (popup) {
                      if (openPopupRef.current && openPopupRef.current !== popup) {
                        openPopupRef.current.remove();
                      }
                      popup.setLngLat(marker.getLngLat()).addTo(map);
                      openPopupRef.current = popup;
                    }
                  }
                }}
              >
                {it.album_image_url ? (
                  <div
                    style={{
                      width: "100%",
                      paddingBottom: "100%",
                      position: "relative",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={it.album_image_url}
                      alt={it.title}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      paddingBottom: "100%",
                      background: "#e5e7eb",
                      borderRadius: 8,
                    }}
                  />
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.title}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      margin: 0,
                      color: "#4b5563",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.artist}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      margin: 0,
                      color: "#9ca3af",
                    }}
                  >
                    {new Date(it.played_at).toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>

      </div>
    </main>
  );
}
