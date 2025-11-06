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
  // 1) Unicode 正規化（互換：全角→半角など）
  let s = String(value).normalize("NFKC");
  // 2) 全角記号→半角置換
  s = Array.from(s).map((ch) => charReplacements[ch] ?? ch).join("");
  // 3) 制御文字（\t \r \n 以外）を除去
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // 4) ゼロ幅系を除去（ZWSP/ZWNJ/ZWJ/BOM）
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // 5) 連続空白を1つに圧縮して前後をトリム
  s = s.replace(/\s+/g, " ").trim();
  // 6) 過剰入力防止のための上限
  if (s.length > 512) s = s.slice(0, 512);
  return s;
}

// URL 専用サニタイズ: http/https のみ許可。妥当でなければ null。
function sanitizeUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = sanitizeText(value);
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.toString();
    }
  } catch {
    // invalid URL
  }
  return null;
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
      id, played_at, lat, lng, duration_ms, mood, mood_note, created_at,
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
    mood: row.mood ?? null,
    mood_note: row.mood_note ?? null,
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
  // 画像 URL は http/https のみ許可。妥当でなければ null。
  const cleanImage = sanitizeUrl(sanitizedBody.album_image_url);

  // ★ mood と mood_note を定義（ASCIIラベルで管理）
  const rawMood = sanitizeText((sanitizedBody as AnyObject).mood);
  // 許容ラベル：happy / soso / sad / other
  const allowed = new Set(["happy", "soso", "sad", "other"]);
  const mood =
    rawMood && allowed.has(rawMood) ? (rawMood as "happy" | "soso" | "sad" | "other") : null;

  // other のときだけ自由記入を採用（空文字は null に）
  let mood_note: string | null = null;
  if (mood === "other") {
    const note = sanitizeText((sanitizedBody as AnyObject).mood_note);
    mood_note = note.length ? note.slice(0, 120) : null; // 長さはお好みで
  }

  const trackUpsertPayload = {
    spotify_track_id: cleanSpotifyId,
    title: cleanTitle,
    artist: cleanArtist,
    album_image_url: cleanImage,
  };

  // TODO: ログが多い場合は後でフィルタリングを検討
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

  const nLat = Number(sanitizedBody.lat);
  const nLng = Number(sanitizedBody.lng);
  const nDur = Number(sanitizedBody.duration_ms);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return json({ error: "lat/lng must be finite numbers" }, 400);
  }
  if (!Number.isFinite(nDur) || nDur < 0) {
    return json({ error: "duration_ms must be a non-negative number" }, 400);
  }

  const listenRow = {
    track_id,
    played_at: sanitizedPlayedAt,
    duration_ms: Number(sanitizedBody.duration_ms),
    lat: Number(sanitizedBody.lat),
    lng: Number(sanitizedBody.lng),
    mood,
    mood_note,
    // user_id は Auth 導入後に
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
