import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-publish-secret",
};

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemToBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function getFcmAccessToken(account: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Firebase OAuth token request failed: " + JSON.stringify(result));
  return result.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const expectedSecret = Deno.env.get("PUBLISH_WEBHOOK_SECRET") || "";
  if (!expectedSecret || req.headers.get("x-publish-secret") !== expectedSecret) {
    return new Response("Unauthorized webhook", { status: 401, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload.record || payload;
    // Draft saves are deliberately ignored. Only the Admin Panel's Publish action sets this true.
    if (record.update_available !== true || !record.id) {
      return new Response(JSON.stringify({ ok: true, skipped: "not-a-published-app" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")!;
    const account = JSON.parse(serviceAccountRaw);
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: tokens, error } = await supabase.from("device_push_tokens").select("token").eq("app_id", "com.shanpalia.paliaapkhub");
    if (error) throw error;
    if (!tokens?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, "content-type": "application/json" } });

    const accessToken = await getFcmAccessToken(account);
    const appName = String(record.name || record.title || "New app");
    const version = String(record.version || "");
    const targetUrl = "https://shanpalia.github.io/WebsitePaliaAPK_V.2/app.html?id=" + encodeURIComponent(String(record.id));
    let sent = 0;
    let failed = 0;
    for (const row of tokens) {
      const response = await fetch("https://fcm.googleapis.com/v1/projects/" + account.project_id + "/messages:send", {
        method: "POST",
        headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: {
              title: "New on PaliaAPK HUB",
              body: appName + (version ? " · Version " + version : "") + " is now published.",
            },
            data: {
              appId: String(record.id),
              url: targetUrl,
              appName,
              version,
            },
            android: { priority: "HIGH", notification: { channel_id: "paliaapk_updates", sound: "default" } },
          },
        }),
      });
      if (response.ok) sent++;
      else {
        failed++;
        const details = await response.text();
        console.error("FCM send failed", response.status, details);
        if (response.status === 404 || response.status === 400) {
          await supabase.from("device_push_tokens").delete().eq("token", row.token);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, failed, appId: record.id }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
