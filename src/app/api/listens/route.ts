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

// ★ OpenWeatherMap から現在の天気を取得するヘルパー
async function fetchWeatherFromOpenWeather(lat: number, lng: number) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn("[weather] OPENWEATHER_API_KEY is not set");
    return null;
  }

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "metric"); // 摂氏
    url.searchParams.set("lang", "ja");      // 日本語（お好みで）

    console.log("[weather] request URL:", url.toString()); // 🌟 追加

    const res = await fetch(url.toString());
    console.log("[weather] status:", res.status); // 🌟 追加
    if (!res.ok) {
      console.warn("[weather] OpenWeatherMap response not ok", res.status);
      return null;
    }

    const data = await res.json();
    console.log("[weather] raw:", data); // 🌟 追加

    // OpenWeatherMap の代表値をざっくり拾う
    const main = data.weather?.[0]?.main ?? null;           // 例: "Clear"
    const description = data.weather?.[0]?.description ?? null; // 例: "晴天"
    const tempC = typeof data.main?.temp === "number" ? data.main.temp : null;

    console.log("[weather] parsed:", { main, description, tempC }); // 🌟 追加

    return {
      weather_main: main,
      weather_description: description,
      weather_temp_c: tempC,
    };
  } catch (e) {
    console.error("[weather] fetch error", e);
    return null;
  }
}

export async function GET() {
  // 最新200件（tracksとJOINして表示に必要な情報をまとめて返す）
  const { data, error } = await supabaseAdmin
    .from("listens")
    .select(
      `
      id, played_at, spotify_played_at, lat, lng, duration_ms, mood, mood_note, weather_main, weather_description, weather_temp_c, created_at,
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
    spotify_played_at: row.spotify_played_at,
    lat: row.lat,
    lng: row.lng,
    duration_ms: row.duration_ms,
    mood: row.mood ?? null,
    mood_note: row.mood_note ?? null,
    weather_main: row.weather_main ?? null,              // ★ 追加
    weather_description: row.weather_description ?? null, // ★ 追加
    weather_temp_c: row.weather_temp_c ?? null,          // ★ 追加
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
    "spotify_played_at",
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
  const sanitizedSpotifyPlayedAt = sanitizeText(sanitizedBody.spotify_played_at);

  // ★ lat/lng を number として取り出す
  const lat = Number(sanitizedBody.lat);
  const lng = Number(sanitizedBody.lng);

  // ★ mood / mood_note も安全に取り出す
  const mood =
    typeof sanitizedBody.mood === "string" ? sanitizeText(sanitizedBody.mood) : null;
  const mood_note =
    typeof sanitizedBody.mood_note === "string" ? sanitizeText(sanitizedBody.mood_note) : null;

  // ★ 天気用の変数を用意（デフォルトは null）
  let weather_main: string | null = null;
  let weather_description: string | null = null;
  let weather_temp_c: number | null = null;

  // ★ lat/lng がちゃんと数値で、APIキーもあるときだけ天気を取りに行く
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    const weather = await fetchWeatherFromOpenWeather(lat, lng);
    if (weather) {
      weather_main = weather.weather_main;
      weather_description = weather.weather_description;
      weather_temp_c = weather.weather_temp_c;
    }
  }

  const nDur = Number(sanitizedBody.duration_ms);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: "lat/lng must be finite numbers" }, 400);
  }
  if (!Number.isFinite(nDur) || nDur < 0) {
    return json({ error: "duration_ms must be a non-negative number" }, 400);
  }

  const listenRow = {
    track_id,
    played_at: sanitizedPlayedAt,
    spotify_played_at: sanitizedSpotifyPlayedAt,
    duration_ms: Number(sanitizedBody.duration_ms),
    lat,
    lng,
    mood,
    mood_note,
    weather_main,
    weather_description,
    weather_temp_c,
    // user_id は Auth 導入後に
  };

  detectNonAscii(listenRow, ["listens"]);

  // 簡易・重複排除（同一曲×同時刻×近傍を拒否）
  const { data: dup, error: dupErr } = await supabaseAdmin
    .from("listens")
    .select("id, lat, lng, spotify_played_at, track_id")
    .eq("track_id", track_id)
    .eq("spotify_played_at", listenRow.spotify_played_at)
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

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const sanitizedBody = sanitizePayloadDeep(body);
  const id = sanitizeText(sanitizedBody.id);
  const mood =
    typeof sanitizedBody.mood === "string" ? sanitizeText(sanitizedBody.mood) : "";
  const mood_note =
    typeof sanitizedBody.mood_note === "string" ? sanitizeText(sanitizedBody.mood_note) : null;

  if (!id) return json({ error: "Missing field: id" }, 400);
  if (!mood) return json({ error: "Missing field: mood" }, 400);

  const { error: upErr } = await supabaseAdmin
    .from("listens")
    .update({ mood, mood_note })
    .eq("id", id);

  if (upErr) return json({ error: `listens update failed: ${upErr.message}` }, 500);

  return json({ ok: true, id });
}
