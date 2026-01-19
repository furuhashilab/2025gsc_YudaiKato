import { createClient } from "@supabase/supabase-js";
import { sanitizeEnvValue } from "@/utils/sanitize";

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
