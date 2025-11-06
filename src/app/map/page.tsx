"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [items, setItems] = useState<ListenItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [active, setActive] = useState<Record<Exclude<Mood, null>, boolean>>({
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
        const res = await fetch("/api/listens", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "fetch failed");
        if (!cancelled) setItems((json.items ?? []) as ListenItem[]);
      })().catch((e) => setErr(String(e)));
    } catch (e: any) {
      setErr(e?.message ?? "Map init error");
    }

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !items.length) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

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

      const marker = new maplibregl.Marker({ element: el }).setLngLat([it.lng, it.lat]);
      const popupHtml = `
        <div style="min-width:220px">
          ${it.album_image_url ? `<img src="${it.album_image_url}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:8px;"/>` : ""}
          <div style="margin-top:8px">
            <strong>${it.title}</strong><br/>
            <span style="color:#555">${it.artist}</span><br/>
            <span style="color:#777;font-size:12px">${new Date(it.played_at).toLocaleString()}</span><br/>
            ${it.mood ? `<span style="font-size:12px;color:#444">mood: ${it.mood}${it.mood === "other" && it.mood_note ? ` — ${it.mood_note}` : ""}</span>` : ""}
          </div>
        </div>`;
      marker.setPopup(new Popup({ offset: 12 }).setHTML(popupHtml)).addTo(map);
      markersRef.current.push(marker);
      bounds.extend([it.lng, it.lat]);
    }

    if (filtered.length === 1) {
      map.flyTo({ center: [filtered[0].lng, filtered[0].lat], zoom: 14 });
    } else {
      map.fitBounds(bounds, { padding: 60 });
    }
  }, [items, activeSet]);

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "9999px",
                    background: color,
                    border: "1px solid #fff",
                    boxShadow: "0 0 0 1px rgba(0,0,0,.2)",
                  }}
                />
                {key}
              </span>
            </label>
          ))}
        </div>
      </header>

      {err && (
        <div role="alert" style={{ padding: 12, color: "#842029", background: "#f8d7da" }}>
          {err}
        </div>
      )}
      <div ref={containerRef} style={{ flex: 1 }} />
    </main>
  );
}
