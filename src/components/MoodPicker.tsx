import { useId } from "react";

export type Mood = "happy" | "soso" | "sad" | "other";

export function MoodPicker({
  value,
  note,
  onChange,
  onNoteChange,
}: {
  value: Mood;
  note: string;
  onChange: (m: Mood) => void;
  onNoteChange: (s: string) => void;
}) {
  const id = useId();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["happy", "soso", "sad", "other"] as Mood[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={value === m}
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              cursor: "pointer",
              border: value === m ? "2px solid #111" : "1px solid #ccc",
              background: value === m ? "#f5f5f5" : "#fff",
              color: "#111",
            }}
          >
            {m}
          </button>
        ))}
      </div>
      {value === "other" && (
        <input
          id={id}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="moodメモ（任意）"
          maxLength={120}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
        />
      )}
    </div>
  );
}
