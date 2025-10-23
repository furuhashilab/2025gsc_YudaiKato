import { createClient } from "@supabase/supabase-js";

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

function sanitizeEnvValue(name: string, raw: string | undefined): string {
  if (!raw) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  const normalized = raw.normalize("NFKC");
  const replaced = Array.from(normalized)
    .map((ch) => charReplacements[ch] ?? ch)
    .join("");
  const asciiOnly = replaced.replace(/[^\x00-\x7F]/g, "");
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

const url = sanitizeEnvValue("SUPABASE_URL", process.env.SUPABASE_URL);
const anon = sanitizeEnvValue("SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY);
const service = sanitizeEnvValue("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

// 管理用（サーバ専用・RLSを超える権限。API Routeからのみ利用）
export const supabaseAdmin = createClient(url, service, {
  auth: { persistSession: false },
});

// 参考: 将来クライアント側で使うなら anon を使う
export const supabaseAnon = createClient(url, anon, {
  auth: { persistSession: false },
});
