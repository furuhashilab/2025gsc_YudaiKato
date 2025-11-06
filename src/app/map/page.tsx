"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css"; // ← CSSもMapLibreに

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // ❶ OSMラスタタイルの超シンプルなスタイル（スタイルJSONを自前定義）
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
      if (!containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,                           // ← MapboxのstyleURLの代わりに自前style
        center: [139.7671, 35.6812],
        zoom: 11,
        hash: false,
      });

      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", async () => {
        if (cancelled) return;

        // ❷ あなたのAPIからピンを描く（既存ロジックをそのまま流用OK）
        const res = await fetch("/api/listens", { cache: "no-store" });
        const json = await res.json();
        const items = (json.items ?? []) as Array<{
          id: string;
          title: string;
          artist: string;
          album_image_url: string | null;
          played_at: string;
          lat: number;
          lng: number;
        }>;

        if (!items.length) return;

        const bounds = new maplibregl.LngLatBounds();

        for (const it of items) {
          const marker = new maplibregl.Marker() // デフォルトマーカー
            .setLngLat([it.lng, it.lat]);

          const popupHtml = `
            <div style="min-width:220px">
              ${it.album_image_url ? `<img src="${it.album_image_url}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:8px;"/>` : ""}
              <div style="margin-top:8px">
                <strong>${it.title}</strong><br/>
                <span style="color:#555">${it.artist}</span><br/>
                <span style="color:#777;font-size:12px">${new Date(it.played_at).toLocaleString()}</span>
              </div>
            </div>`;

          marker.setPopup(new Popup({ offset: 12 }).setHTML(popupHtml)).addTo(map);
          bounds.extend([it.lng, it.lat]);
        }

        if (items.length === 1) {
          map.flyTo({ center: [items[0].lng, items[0].lat], zoom: 14 });
        } else {
          map.fitBounds(bounds, { padding: 60 });
        }
      });
    } catch (e: any) {
      setErr(e?.message ?? "Map init error");
    }

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
        <strong>Music Walk Map</strong> – MapLibre版
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
