"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";

// mapbox-gl はSSRで落ちやすいので動的import
async function loadMapbox() {
  const m = await import("mapbox-gl");
  return m.default;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!token) throw new Error("Mapbox token is missing (.env)");

        const mapboxgl = await loadMapbox();
        mapboxgl.accessToken = token as string;

        if (!containerRef.current) return;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [139.7671, 35.6812], // 東京駅あたり [lng, lat]
          zoom: 11,
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          // ここに将来レイヤ追加（ピン／ライン）を書いていく
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
