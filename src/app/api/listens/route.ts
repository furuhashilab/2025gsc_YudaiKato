export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type AnyObject = Record<string, unknown>;

// 共通ヘルパ
function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const charReplacements: Record<string, string> = {
  "（": "(",
  "）": ")",
  "【": "[",
  "】": "]",
  "｛": "{",
  "｝": "}",
  "！": "!",
  "？": "?",
  "＠": "@",
  "＃": "#",
  "＄": "$",
  "％": "%",
  "＆": "&",
  "＊": "*",
  "＋": "+",
  "－": "-",
  "＝": "=",
  "：": ":",
  "；": ";",
  "，": ",",
  "．": ".",
  "／": "/",
  "＼": "\\",
  "｜": "|",
  "＾": "^",
  "｀": "`",
  "～": "~",
  "＜": "<",
  "＞": ">",
  "「": "\"",
  "」": "\"",
  "『": "\"",
  "』": "\"",
  "“": "\"",
  "”": "\"",
  "’": "'",
  "＇": "'",
  "　": " ",
};

function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const normalized = String(value).normalize("NFKC");
  const replaced = Array.from(normalized)
    .map((ch) => charReplacements[ch] ?? ch)
    .join("");
  return replaced.replace(/[^\x00-\x7F]/g, "").trim();
}

function sanitizePayloadDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const result: AnyObject = {};
    for (const [key, val] of Object.entries(value as AnyObject)) {
      result[key] = sanitizePayloadDeep(val);
    }
    return result as T;
  }
  if (typeof value === "string") {
    return sanitizeText(value) as unknown as T;
  }
  return value;
}

function detectNonAscii(value: unknown, path: string[] = []): void {
  if (typeof value === "string") {
    const codes: number[] = [];
    for (const ch of value) {
      const code = ch.codePointAt(0) ?? 0;
      if (code > 0x7f) codes.push(code);
    }
    if (codes.length > 0) {
      console.warn(
        `[listens] Non-ASCII detected at ${path.join(".") || "<root>"}: ${codes.join(", ")}`
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => detectNonAscii(item, [...path, String(idx)]));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value as AnyObject).forEach(([key, val]) =>
      detectNonAscii(val, [...path, key])
    );
  }
}

export async function GET() {
  // 最新200件（tracksとJOINして表示に必要な情報をまとめて返す）
  const { data, error } = await supabaseAdmin
    .from("listens")
    .select(
      `
      id, played_at, lat, lng, duration_ms, created_at,
      tracks:track_id (
        spotify_track_id, title, artist, album_image_url
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return json({ error: error.message }, 500);

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    played_at: row.played_at,
    lat: row.lat,
    lng: row.lng,
    duration_ms: row.duration_ms,
    title: row.tracks?.title ?? "",
    artist: row.tracks?.artist ?? "",
    album_image_url: row.tracks?.album_image_url ?? null,
    spotify_track_id: row.tracks?.spotify_track_id ?? "",
  }));

  return json({ items });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const required = [
    "spotify_track_id",
    "title",
    "artist",
    "played_at",
    "duration_ms",
    "lat",
    "lng",
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return json({ error: `Missing field: ${k}` }, 400);
    }
  }

  const sanitizedBody = sanitizePayloadDeep(body);

  const cleanSpotifyId = sanitizeText(sanitizedBody.spotify_track_id);
  const cleanTitle = sanitizeText(sanitizedBody.title);
  const cleanArtist = sanitizeText(sanitizedBody.artist);
  const cleanImage =
    sanitizedBody.album_image_url === null || sanitizedBody.album_image_url === undefined
      ? null
      : sanitizeText(sanitizedBody.album_image_url);

  const trackUpsertPayload = {
    spotify_track_id: cleanSpotifyId,
    title: cleanTitle,
    artist: cleanArtist,
    album_image_url: cleanImage,
  };

  detectNonAscii(trackUpsertPayload, ["tracks"]);

  // 1) tracks を upsert（spotify_track_id で一意）
  const { data: upserted, error: upErr } = await supabaseAdmin
    .from("tracks")
    .upsert(trackUpsertPayload, { onConflict: "spotify_track_id" })
    .select("id")
    .single();

  if (upErr) return json({ error: `tracks upsert failed: ${upErr.message}` }, 500);
  const track_id = upserted!.id;

  const sanitizedPlayedAt = sanitizeText(sanitizedBody.played_at);

  const listenRow = {
    track_id,
    played_at: sanitizedPlayedAt,
    duration_ms: Number(sanitizedBody.duration_ms),
    lat: Number(sanitizedBody.lat),
    lng: Number(sanitizedBody.lng),
    // mood は後で。user_id も後でAuth導入時に付与
  };

  detectNonAscii(listenRow, ["listens"]);

  // 簡易・重複排除（同一曲×同時刻×近傍を拒否）
  const { data: dup, error: dupErr } = await supabaseAdmin
    .from("listens")
    .select("id, lat, lng, played_at, track_id")
    .eq("track_id", track_id)
    .eq("played_at", listenRow.played_at)
    .limit(1);
  if (dupErr) return json({ error: dupErr.message }, 500);

  if (dup && dup.length > 0) {
    const d = dup[0];
    const near =
      Math.abs(d.lat - listenRow.lat) < 1e-4 && Math.abs(d.lng - listenRow.lng) < 1e-4;
    if (near) return json({ ok: true, id: d.id, duplicated: true });
  }

  const { data: ins, error: insErr } = await supabaseAdmin
    .from("listens")
    .insert([listenRow])
    .select("id")
    .single();

  if (insErr) return json({ error: `listens insert failed: ${insErr.message}` }, 500);

  return json({ ok: true, id: ins!.id });
}
