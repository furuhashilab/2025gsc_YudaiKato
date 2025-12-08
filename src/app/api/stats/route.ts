export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type TimeSlot = "night" | "morning" | "day" | "evening";

function getTimeSlot(isoString: string | null): TimeSlot | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const hour = d.getHours();
  if (hour < 5) return "night";
  if (hour < 10) return "morning";
  if (hour < 17) return "day";
  if (hour < 24) return "evening";
  return null;
}

export async function GET() {
  // mood × weather_main × played_at(時間帯) の件数を集計
  const { data, error } = await supabaseAdmin
    .from("listens")
    .select("mood, weather_main, played_at", { count: "exact", head: false });

  if (error) {
    console.error("[stats] supabase error", error);
    return json({ error: error.message }, 500);
  }

  // supabase-js だと group by をそのまま書きづらいので
  // いったん全部取ってから、アプリ側で集計するシンプル実装
  const moodWeatherCounts = new Map<string, number>();
  const moodWeatherByTimeCounts = new Map<string, number>();

  for (const row of data ?? []) {
    const mood = row.mood as string | null;
    const weather = row.weather_main as string | null;
    const playedAt = row.played_at as string | null;

    if (!mood || !weather) continue;

    const key = `${weather}__${mood}`;
    moodWeatherCounts.set(key, (moodWeatherCounts.get(key) ?? 0) + 1);

    const timeSlot = getTimeSlot(playedAt);
    if (timeSlot) {
      const timeKey = `${weather}__${mood}__${timeSlot}`;
      moodWeatherByTimeCounts.set(
        timeKey,
        (moodWeatherByTimeCounts.get(timeKey) ?? 0) + 1
      );
    }
  }

  const moodWeather = Array.from(moodWeatherCounts.entries())
    .map(([key, count]) => {
      const [weather_main, mood] = key.split("__");
      return { weather_main, mood, count };
    });

  const moodWeatherByTime = Array.from(moodWeatherByTimeCounts.entries()).map(
    ([key, count]) => {
      const [weather_main, mood, time_slot] = key.split("__") as [
        string,
        string,
        TimeSlot
      ];
      return { weather_main, mood, time_slot, count };
    }
  );

  return json({ moodWeather, moodWeatherByTime });
}
