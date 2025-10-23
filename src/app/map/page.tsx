"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";

async function loadMapbox() {
  const m = await import("mapbox-gl");
  return m.default;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxglRef = useRef<any>(null);            // ★ 追加：mapboxglを保持
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!token) throw new Error("Mapbox token is missing (.env)");

        const mapboxgl = await loadMapbox();
        mapboxglRef.current = mapboxgl;             // ★ 保持
        mapboxgl.accessToken = token as string;

        if (!containerRef.current) return;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [139.7671, 35.6812],
          zoom: 11,
        });

        mapRef.current = map;

        map.on("load", async () => {
          if (cancelled) return;

          try {
            const res = await fetch("/api/listens", { cache: "no-store" });
            const json = await res.json();
            const items = (json.items ?? []) as Array<{
              id: string; title: string; artist: string;
              album_image_url: string | null; played_at: string; lat: number; lng: number;
            }>;

            if (!items.length) return;

            const mapboxgl = mapboxglRef.current;   // ★ ここで参照する
            const bounds = new mapboxgl.LngLatBounds();

            for (const it of items) {
              new mapboxgl.Marker() // ← デフォルトマーカー（CSS必須）
                .setLngLat([it.lng, it.lat]) // ★ 順番は [lng, lat]
                .setPopup(
                  new mapboxgl.Popup({ offset: 12 }).setHTML(
                    `<div style="min-width:220px">
          ${it.album_image_url ? `<img src="${it.album_image_url}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:8px;"/>` : ""}
          <div style="margin-top:8px">
            <strong>${it.title}</strong><br/>
            <span style="color:#555">${it.artist}</span><br/>
            <span style="color:#777;font-size:12px">${new Date(it.played_at).toLocaleString()}</span>
          </div>
        </div>`
                  )
                )
                .addTo(map);

              bounds.extend([it.lng, it.lat]);
            }

            if (items.length === 1) {
              map.flyTo({ center: [items[0].lng, items[0].lat], zoom: 14 });
            } else {
              map.fitBounds(bounds, { padding: 60, duration: 800 });
            }
          } catch (e) {
            console.error(e);
          }
        });
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Map init error");
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <strong>Music Walk Map</strong> – 地図プレビュー
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
