import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";

const SUPABASE_URL = "https://ralinnuegsbuvlhwpzln.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhbGlubnVlZ3NidXZsaHdwemxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTU2NDIsImV4cCI6MjA5NTg3MTY0Mn0.hIec6UxRx5gzSMTi5oJ3_xXw3d1QKCmKsPF-stBwIFE";
const SITE_URL = "https://shanpalia.github.io/WebsitePaliaAPK_V.2/";
const LAST_UPDATE_KEY = "paliaapk_last_catalog_update_v1";

function safeAppUrl(app) {
  return SITE_URL + "app.html?id=" + encodeURIComponent(String(app.id || ""));
}
function showUpdateAlert(app) {
  if (document.getElementById("paliaUpdateAlert")) return;
  const overlay = document.createElement("div");
  overlay.id = "paliaUpdateAlert";
  overlay.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px";
  const card = document.createElement("div");
  card.style.cssText = "width:min(420px,100%);background:#fff;color:#111827;border-radius:22px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Arial,sans-serif";
  const title = document.createElement("h2");
  title.textContent = "New on PaliaAPK HUB";
  title.style.cssText = "font-size:21px;font-weight:800;margin:0 0 8px";
  const name = document.createElement("p");
  name.textContent = (app.name || app.title || "A new app") + (app.version ? " · Version " + app.version : "");
  name.style.cssText = "font-weight:700;margin:0 0 8px";
  const desc = document.createElement("p");
  desc.textContent = app.description || "A new app or update has been published. Open PaliaAPK HUB to view it.";
  desc.style.cssText = "font-size:14px;line-height:1.5;color:#4b5563;margin:0 0 20px";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:10px";
  const later = document.createElement("button");
  later.textContent = "Later";
  later.style.cssText = "flex:1;padding:12px;border:1px solid #d1d5db;border-radius:12px;background:#fff;font-weight:700";
  later.onclick = () => overlay.remove();
  const open = document.createElement("button");
  open.textContent = "View update";
  open.style.cssText = "flex:1;padding:12px;border:0;border-radius:12px;background:#16a34a;color:#fff;font-weight:800";
  open.onclick = () => { window.location.href = safeAppUrl(app); };
  actions.append(later, open);
  card.append(title, name, desc, actions);
  overlay.append(card);
  document.body.append(overlay);
}

async function checkCatalogUpdate() {
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/apps?update_available=eq.true&select=id,name,title,version,description,updated_at,created_at&order=updated_at.desc.nullslast&limit=1", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }
    });
    if (!response.ok) return;
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return;
    const app = rows[0];
    const stamp = app.updated_at || app.created_at || "";
    const last = localStorage.getItem(LAST_UPDATE_KEY);
    if (!last) {
      localStorage.setItem(LAST_UPDATE_KEY, stamp);
      return;
    }
    if (stamp && stamp !== last) {
      localStorage.setItem(LAST_UPDATE_KEY, stamp);
      showUpdateAlert(app);
    }
  } catch (error) {
    console.warn("PaliaAPK catalog update check failed", error);
  }
}

async function registerPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") {
      console.info("PaliaAPK notifications are not permitted by the user.");
      return;
    }
    await PushNotifications.createChannel({ id: "paliaapk_updates", name: "PaliaAPK HUB Updates", description: "New apps and APK updates", importance: 4, sound: "default", vibration: true });
    await PushNotifications.addListener("registration", async ({ value }) => {
      if (!value) return;
      try {
        const response = await fetch(SUPABASE_URL + "/rest/v1/device_push_tokens", {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: "Bearer " + SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates,return=minimal"
          },
          body: JSON.stringify({ token: value, platform: "android", app_id: "com.shanpalia.paliaapkhub" })
        });
        if (!response.ok && response.status !== 409) {
          console.warn("Could not register notification token:", response.status);
        }
      } catch (error) {
        console.warn("Could not save notification token", error);
      }
    });
    await PushNotifications.addListener("registrationError", error => console.warn("FCM registration failed", error));
    await PushNotifications.addListener("pushNotificationActionPerformed", action => {
      const data = action.notification && action.notification.data || {};
      const url = typeof data.url === "string" && data.url.startsWith("https://shanpalia.github.io/WebsitePaliaAPK_V.2/")
        ? data.url : SITE_URL;
      window.location.href = url;
    });
    await PushNotifications.addListener("pushNotificationReceived", notification => {
      const data = notification && notification.data || {};
      if (data.appId) {
        checkSpecificPublishedApp(data.appId).catch(() => {});
      }
    });
    await PushNotifications.register();
  } catch (error) {
    console.warn("PaliaAPK push setup failed", error);
  }
}

async function checkSpecificPublishedApp(appId) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/apps?id=eq." + encodeURIComponent(appId) + "&select=id,name,title,version,description,updated_at,created_at&limit=1", {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }
  });
  if (!response.ok) return;
  const rows = await response.json();
  if (rows[0]) showUpdateAlert(rows[0]);
}

function start() {
  checkCatalogUpdate();
  registerPushNotifications();
  if (Capacitor.isNativePlatform()) {
    App.addListener("appStateChange", ({ isActive }) => { if (isActive) checkCatalogUpdate(); });
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
