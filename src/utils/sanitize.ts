type AnyObject = Record<string, unknown>;

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

export function normalizeText(value: string): string {
  const normalized = value.normalize("NFKC");
  return Array.from(normalized)
    .map((ch) => charReplacements[ch] ?? ch)
    .join("");
}

export function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  // 1) Unicode normalize (compat: full-width -> half-width, etc.)
  let s = normalizeText(String(value));
  // 2) Remove control chars (except \t \r \n)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // 3) Remove zero-width (ZWSP/ZWNJ/ZWJ/BOM)
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // 4) Collapse whitespace and trim
  s = s.replace(/\s+/g, " ").trim();
  // 5) Cap length
  if (s.length > 512) s = s.slice(0, 512);
  return s;
}

export function sanitizeUrl(value: unknown): string | null {
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

export function sanitizePayloadDeep<T>(value: T): T {
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

export function detectNonAscii(value: unknown, path: string[] = []): void {
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

export function sanitizeEnvValue(name: string, raw: string | undefined): string {
  if (!raw) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  const normalized = normalizeText(raw);
  const asciiOnly = normalized.replace(/[^\x00-\x7F]/g, "");
  if (!asciiOnly) {
    throw new Error(`Environment variable ${name} becomes empty after sanitization.`);
  }
  if (asciiOnly !== raw) {
    const nonAsciiCodes = Array.from(raw)
      .map((ch) => ch.codePointAt(0) ?? 0)
      .filter((code) => code > 0x7f);
    console.warn(
      `[supabase] Sanitized ${name}; removed non-ASCII code points: ${nonAsciiCodes.join(", ")}`
    );
  }
  return asciiOnly;
}
