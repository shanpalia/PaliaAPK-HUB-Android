/**
 * PaliaAPK HUB - Telegram Publisher Utility
 * Handles sending APK files via fetch multipart/form-data to the Cloudflare Worker.
 */

/**
 * Uploads an APK file and its metadata to the Telegram storage worker.
 * 
 * @param {File} apkFile - The .apk File object to upload.
 * @param {string} appName - The name of the application.
 * @param {string} version - The version string of the application.
 * @param {string} developer - The developer name.
 * @param {string} workerUrl - The base URL of the Cloudflare Worker.
 * @returns {Promise<Object>} The standardized result object containing file info or error.
 */
const API_URL =
"https://paliaapk-telegram-api.onrender.com";

export async function uploadApkToTelegram({
  apkFile,
  appName,
  version,
  developer
}) {
  // Initialize default response payload structure
 const resultPayload = {
  success: false,
  telegram_file_id: null,
  telegram_file_unique_id: null,
  telegram_message_id: null,
  download_url: null,
  file_name: apkFile ? apkFile.name : null,
  file_size: apkFile ? apkFile.size : 0,
  mime_type: apkFile ? apkFile.type : null,
  error: null,
};

  try {
  // Validate required inputs
if (!apkFile) {
  throw new Error("Missing required APK file.");
}

if (!apkFile.name.toLowerCase().endsWith(".apk")) {
  throw new Error("Only APK files are allowed.");
}
const allowedTypes = [
  "application/vnd.android.package-archive",
  "application/octet-stream"
];

if (
  apkFile.type &&
  !allowedTypes.includes(apkFile.type)
) {
  throw new Error("Invalid APK file.");
}
if (!appName?.trim()) {
  throw new Error("App name is required.");
}

if (!version?.trim()) {
  throw new Error("Version is required.");
}

if (!API_URL) {
    throw new Error("Missing Render API URL.");
}

    // Construct multipart form data matching worker requirements
  const formData = new FormData();

formData.append("file", apkFile);
formData.append("appName", appName || "");
formData.append("version", version || "");
formData.append("developer", developer || "");

    // Set up a 60-second timeout using AbortController
   const endpoint = `${API_URL}/upload-apk`;

let response;

try {

    response = await fetch(endpoint, {
        method: "POST",
        body: formData
    });

} catch (networkError) {

    throw new Error(
        `Network error occurred: ${networkError.message}`
    );

}

    // Parse response body as text first to safely handle non-JSON responses (invalid JSON / worker crashes)
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
     throw new Error(
  `Invalid JSON response from Render server (HTTP ${response.status}): ${responseText || "Empty response"}`
);
    }

    // Check if worker returned an HTTP error or logical failure
    if (!response.ok || !data.success) {
     throw new Error(
data.error ||
`Render upload failed (HTTP ${response.status})`
);
    }

    // Populate successful result data
    resultPayload.success = true;
    resultPayload.telegram_file_id =
    data.telegram_file_id || null;

resultPayload.telegram_file_unique_id =
    data.telegram_file_unique_id || null;

resultPayload.telegram_message_id =
    data.telegram_message_id || null;

resultPayload.download_url =
    data.download_url || null;

resultPayload.file_name =
    data.file_name || apkFile.name;

resultPayload.file_size =
    data.file_size ?? apkFile.size;

resultPayload.mime_type =
    data.mime_type ??
    apkFile.type ??
    "application/vnd.android.package-archive";

   return Object.freeze(resultPayload);
  } catch (err) {
    resultPayload.success = false;
    resultPayload.error = err.message;
    return Object.freeze(resultPayload);
  }
}
