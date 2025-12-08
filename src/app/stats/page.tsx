"use client";

import { useEffect, useState } from "react";

type MoodWeatherStat = {
  weather_main: string;
  mood: string;
  count: number;
};

type MoodWeatherTimeStat = {
  weather_main: string;
  mood: string;
  time_slot: "night" | "morning" | "day" | "evening";
  count: number;
};

type StatsResponse = {
  moodWeather: MoodWeatherStat[];
  moodWeatherByTime?: MoodWeatherTimeStat[];
};

export default function StatsPage() {
  const [stats, setStats] = useState<MoodWeatherStat[] | null>(null);
  const [timeStats, setTimeStats] = useState<MoodWeatherTimeStat[] | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json: StatsResponse = await res.json();
        setStats(json.moodWeather);
        setTimeStats(json.moodWeatherByTime ?? []);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-4">Loading stats...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!stats || stats.length === 0)
    return <div className="p-4">まだデータがありません。</div>;

  // 天気→mood の並び替え用に軽くソート
  const sorted = [...stats].sort((a, b) => {
    if (a.weather_main === b.weather_main) {
      return a.mood.localeCompare(b.mood);
    }
    return a.weather_main.localeCompare(b.weather_main);
  });

  const timeOrder: Record<MoodWeatherTimeStat["time_slot"], number> = {
    night: 0,
    morning: 1,
    day: 2,
    evening: 3,
  };
  const timeLabels: Record<MoodWeatherTimeStat["time_slot"], string> = {
    night: "夜",
    morning: "朝",
    day: "昼",
    evening: "夕方",
  };

  type DisplayTimeStat = MoodWeatherTimeStat & { time_slot: MoodWeatherTimeStat["time_slot"] | "unknown"; __key: number };

  const sortedTimeStats: DisplayTimeStat[] = (timeStats ?? [])
    .map((row, idx) => {
      const slot: DisplayTimeStat["time_slot"] =
        row.time_slot && row.time_slot in timeOrder ? row.time_slot : "unknown";
      return { ...row, time_slot: slot, __key: idx };
    })
    .sort((a, b) => {
      if (a.time_slot !== b.time_slot) {
        return (timeOrder[a.time_slot as MoodWeatherTimeStat["time_slot"]] ?? 99) -
          (timeOrder[b.time_slot as MoodWeatherTimeStat["time_slot"]] ?? 99);
      }
      if (a.weather_main === b.weather_main) {
        return a.mood.localeCompare(b.mood);
      }
      return a.weather_main.localeCompare(b.weather_main);
    });

  return (
    <main className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Mood × 天気集計</h1>
      <p className="text-sm text-gray-600">
        listens テーブルから、mood と天気（weather_main）の組み合わせごとの件数を集計しています。
      </p>

      <table className="border-collapse border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-2 py-1">天気 (weather_main)</th>
            <th className="border border-gray-300 px-2 py-1">mood</th>
            <th className="border border-gray-300 px-2 py-1">件数</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={`${row.weather_main}-${row.mood}`}>
              <td className="border border-gray-300 px-2 py-1">
                {row.weather_main}
              </td>
              <td className="border border-gray-300 px-2 py-1">
                {row.mood}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-right">
                {row.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sortedTimeStats.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Mood × 天気 × 時間帯</h2>
          <p className="text-sm text-gray-600">
            時間帯（朝/昼/夕方/夜）も含めた組み合わせごとの件数を表示します。
          </p>
          <table className="border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1">時間帯</th>
                <th className="border border-gray-300 px-2 py-1">
                  天気 (weather_main)
                </th>
                <th className="border border-gray-300 px-2 py-1">mood</th>
                <th className="border border-gray-300 px-2 py-1">件数</th>
              </tr>
            </thead>
            <tbody>
              {sortedTimeStats.map((row) => (
                <tr
                  key={`${row.weather_main}-${row.mood}-${row.time_slot}-${row.__key}`}
                >
                  <td className="border border-gray-300 px-2 py-1">
                    {timeLabels[row.time_slot as MoodWeatherTimeStat["time_slot"]] ?? "不明"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {row.weather_main}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {row.mood}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
