const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), "android");
const pkg = "com.shanpalia.paliaapkhub";
const appVersionName = "1.0.1";
const appVersionCode = 2;
const appGradle = path.join(root, "app/build.gradle");
const appGradleKts = path.join(root, "app/build.gradle.kts");
const javaDir = path.join(root, "app/src/main/java/com/shanpalia/paliaapkhub");
const res = path.join(root, "app/src/main/res");


// Set the user-visible Android app version on every generated build.
for (const gradlePath of [appGradle, appGradleKts]) {
  if (!fs.existsSync(gradlePath)) continue;
  let gradle = fs.readFileSync(gradlePath, "utf8");
  if (/versionCode\s+\d+/.test(gradle)) {
    gradle = gradle.replace(/versionCode\s+\d+/, "versionCode " + appVersionCode);
  } else if (/versionCode\s*=\s*\d+/.test(gradle)) {
    gradle = gradle.replace(/versionCode\s*=\s*\d+/, "versionCode = " + appVersionCode);
  }
  if (/versionName\s+"[^"]*"/.test(gradle)) {
    gradle = gradle.replace(/versionName\s+"[^"]*"/, 'versionName "' + appVersionName + '"');
  } else if (/versionName\s*=\s*"[^"]*"/.test(gradle)) {
    gradle = gradle.replace(/versionName\s*=\s*"[^"]*"/, 'versionName = "' + appVersionName + '"');
  }
  fs.writeFileSync(gradlePath, gradle);
  console.log("Android app version set to " + appVersionName + " (code " + appVersionCode + ")");
  break;
}

fs.mkdirSync(javaDir, { recursive: true });
const exactIconSource = path.join(process.cwd(), "www", "assets", "icon.png");
const exactIconDest = path.join(res, "drawable", "palia_exact_icon.png");
for (const d of ["drawable", "mipmap-anydpi-v26", "values", "xml"]) {
  fs.mkdirSync(path.join(res, d), { recursive: true });
}
if (fs.existsSync(exactIconSource)) fs.copyFileSync(exactIconSource, exactIconDest);
// Native downloader: stays inside the PaliaAPK HUB app process.
// It does NOT use Android DownloadManager or its system notification.
const newPlugin = `package ${pkg};

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "PaliaDownloader")
public class PaliaDownloaderPlugin extends Plugin {
    private volatile boolean downloading = false;
    private File downloadedFile;

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "PaliaAPK-HUB-App.apk");

        if (url == null || url.isEmpty()) {
            call.reject("Download URL is missing");
            return;
        }
        if (downloading) {
            call.reject("A download is already running");
            return;
        }

        File base = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (base == null) {
            call.reject("App download storage is unavailable");
            return;
        }
        if (!base.exists() && !base.mkdirs()) {
            call.reject("Unable to create app download folder");
            return;
        }

        downloadedFile = new File(base, filename);
        downloading = true;

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "PaliaAPK-HUB-Android");
                connection.connect();

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) {
                    throw new IOException("HTTP " + code);
                }

                long total = connection.getContentLengthLong();

                try (InputStream in = new BufferedInputStream(connection.getInputStream());
                     OutputStream out = new BufferedOutputStream(new FileOutputStream(downloadedFile))) {

                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    long lastTime = android.os.SystemClock.elapsedRealtime();
                    long lastBytes = 0;
                    int n;

                    while ((n = in.read(buffer)) != -1) {
                        out.write(buffer, 0, n);
                        done += n;

                        long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastTime >= 250) {
                            JSObject progress = new JSObject();
                            progress.put("downloadedBytes", done);
                            progress.put("totalBytes", total);
                            progress.put("timestampMs", now);
                            progress.put("speedBytesPerSecond",
                                    (done - lastBytes) * 1000.0 / Math.max(1, now - lastTime));
                            progress.put("status", "downloading");
                            notifyListeners("downloadProgress", progress);

                            lastTime = now;
                            lastBytes = done;
                        }
                    }
                }

                JSObject completed = new JSObject();
                completed.put("downloadedBytes", downloadedFile.length());
                completed.put("totalBytes", downloadedFile.length());
                completed.put("timestampMs", android.os.SystemClock.elapsedRealtime());
                completed.put("speedBytesPerSecond", 0);
                completed.put("status", "completed");
                completed.put("filename", downloadedFile.getName());
                notifyListeners("downloadProgress", completed);
                call.resolve(completed);

            } catch (Exception e) {
                if (downloadedFile != null && downloadedFile.exists()) {
                    downloadedFile.delete();
                }
                call.reject("Download failed: " + e.getMessage());
            } finally {
                downloading = false;
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

    @PluginMethod
    public void openDownloadedApk(PluginCall call) {
        if (downloadedFile == null || !downloadedFile.exists()) {
            call.reject("APK is not ready");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    downloadedFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open APK installer: " + e.getMessage());
        }
    }
}
`;

fs.writeFileSync(path.join(javaDir, "PaliaDownloaderPlugin.java"), newPlugin);
const googlePluginSource = "package com.shanpalia.paliaapkhub;\n\nimport android.app.Activity;\nimport android.content.Intent;\nimport com.getcapacitor.JSObject;\nimport com.getcapacitor.Plugin;\nimport com.getcapacitor.PluginCall;\nimport com.getcapacitor.PluginMethod;\nimport com.getcapacitor.annotation.CapacitorPlugin;\nimport com.google.android.gms.auth.api.signin.GoogleSignIn;\nimport com.google.android.gms.auth.api.signin.GoogleSignInAccount;\nimport com.google.android.gms.auth.api.signin.GoogleSignInClient;\nimport com.google.android.gms.auth.api.signin.GoogleSignInOptions;\nimport com.google.android.gms.common.api.ApiException;\n\n@CapacitorPlugin(name = \"PaliaGoogleAuth\")\npublic class PaliaGoogleAuthPlugin extends Plugin {\n    private static final int RC_SIGN_IN = 7204;\n    private GoogleSignInClient client;\n\n    @PluginMethod\n    public void signIn(PluginCall call) {\n        int webClientIdResource = getContext().getResources().getIdentifier(\"default_web_client_id\", \"string\", getContext().getPackageName());\n        if (webClientIdResource == 0) {\n            call.reject(\"Google Sign-In is not configured in this APK. Firebase google-services.json was not applied during the build.\");\n            return;\n        }\n        String webClientId = getContext().getString(webClientIdResource);\n        if (webClientId == null || webClientId.isEmpty()) {\n            call.reject(\"Firebase Google OAuth Web client ID is missing. Add google-services.json from Firebase Console.\");\n            return;\n        }\n        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)\n            .requestEmail().requestIdToken(webClientId).build();\n        client = GoogleSignIn.getClient(getActivity(), options);\n        startActivityForResult(call, client.getSignInIntent(), \"googleSignInResult\");\n    }\n\n    @com.getcapacitor.annotation.ActivityCallback\n    private void googleSignInResult(PluginCall call, androidx.activity.result.ActivityResult result) {\n        if (result.getData() == null) {\n            call.reject(\"Google sign-in returned no result (activity result code: \" + result.getResultCode() + \"). Check the Android OAuth SHA-1 certificate registered in Firebase.\");\n            return;\n        }\n        try {\n            GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(result.getData()).getResult(ApiException.class);\n            if (account == null || account.getIdToken() == null) {\n                call.reject(\"Google ID token missing. Verify Firebase Android and Web OAuth client IDs.\");\n                return;\n            }\n            JSObject data = new JSObject();\n            data.put(\"idToken\", account.getIdToken());\n            data.put(\"email\", account.getEmail());\n            data.put(\"displayName\", account.getDisplayName());\n            call.resolve(data);\n        } catch (ApiException e) {\n            call.reject(\"Google sign-in failed: \" + e.getStatusCode(), e);\n        }\n    }\n}\n";
fs.writeFileSync(path.join(javaDir, "PaliaGoogleAuthPlugin.java"), googlePluginSource);


const mainJava = path.join(javaDir, "MainActivity.java");
const mainKotlin = path.join(javaDir, "MainActivity.kt");

if (fs.existsSync(mainJava)) {
  let source = fs.readFileSync(mainJava, "utf8");
  if (!source.includes("import " + pkg + ".PaliaDownloaderPlugin;")) {
    source = source.replace("import com.getcapacitor.BridgeActivity;", "import com.getcapacitor.BridgeActivity;\nimport " + pkg + ".PaliaDownloaderPlugin;");
  }
  if (!source.includes("import " + pkg + ".PaliaGoogleAuthPlugin;")) {
    source = source.replace("import com.getcapacitor.BridgeActivity;", "import com.getcapacitor.BridgeActivity;\nimport " + pkg + ".PaliaGoogleAuthPlugin;");
  }
  if (!source.includes("registerPlugin(PaliaDownloaderPlugin.class)")) {
    source = source.replace("public class MainActivity extends BridgeActivity {", "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(PaliaDownloaderPlugin.class);\n        registerPlugin(PaliaGoogleAuthPlugin.class);\n        super.onCreate(savedInstanceState);\n    }");
  } else if (!source.includes("registerPlugin(PaliaGoogleAuthPlugin.class)")) {
    source = source.replace("registerPlugin(PaliaDownloaderPlugin.class);", "registerPlugin(PaliaDownloaderPlugin.class);\n        registerPlugin(PaliaGoogleAuthPlugin.class);");
  }
  source = source.replace(/super\.onCreate\(savedInstanceState\);\s*registerPlugin\(PaliaDownloaderPlugin\.class\);\s*registerPlugin\(PaliaGoogleAuthPlugin\.class\);/, "registerPlugin(PaliaDownloaderPlugin.class);\n        registerPlugin(PaliaGoogleAuthPlugin.class);\n        super.onCreate(savedInstanceState);");
  fs.writeFileSync(mainJava, source);
} else if (fs.existsSync(mainKotlin)) {
  let source = fs.readFileSync(mainKotlin, "utf8");
  if (!source.includes("import " + pkg + ".PaliaDownloaderPlugin")) {
    source = source.replace(/^package ([^\n]+\n)/m, "package $1\nimport " + pkg + ".PaliaDownloaderPlugin\n");
  }
  if (!source.includes("import " + pkg + ".PaliaGoogleAuthPlugin")) {
    source = source.replace(/^package ([^\n]+\n)/m, "package $1\nimport " + pkg + ".PaliaGoogleAuthPlugin\n");
  }
  if (!source.includes("bridge.registerPlugin(PaliaDownloaderPlugin::class.java)")) {
    source = source.replace("class MainActivity : BridgeActivity() {", "class MainActivity : BridgeActivity() {\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        bridge.registerPlugin(PaliaDownloaderPlugin::class.java)\n        bridge.registerPlugin(PaliaGoogleAuthPlugin::class.java)\n        super.onCreate(savedInstanceState)\n    }");
  } else if (!source.includes("bridge.registerPlugin(PaliaGoogleAuthPlugin::class.java)")) {
    source = source.replace("bridge.registerPlugin(PaliaDownloaderPlugin::class.java)", "bridge.registerPlugin(PaliaDownloaderPlugin::class.java)\n        bridge.registerPlugin(PaliaGoogleAuthPlugin::class.java)");
  }
  fs.writeFileSync(mainKotlin, source);
}
const googleDeps = [
  "androidx.credentials:credentials:1.3.0",
  "androidx.credentials:credentials-play-services-auth:1.3.0",
  "com.google.android.libraries.identity.googleid:googleid:1.1.1",
  "com.google.android.gms:play-services-auth:21.2.0"
];
if (fs.existsSync(appGradle) || fs.existsSync(appGradleKts)) {
  const gradlePath = fs.existsSync(appGradle) ? appGradle : appGradleKts;
  let gradle = fs.readFileSync(gradlePath, "utf8");
  if (!gradle.includes("androidx.credentials:credentials:")) {
    const lines = gradlePath.endsWith(".kts")
      ? googleDeps.map(dep => '    implementation("' + dep + '")').join("\n")
      : googleDeps.map(dep => '    implementation "' + dep + '"').join("\n");
    gradle = gradle.replace(/dependencies\s*\{/m, "dependencies {\n" + lines);
  }
  fs.writeFileSync(gradlePath, gradle);
}


// Apply Firebase's Google Services Gradle plugin only when the project config is present.
// This creates the default_web_client_id resource consumed by PaliaGoogleAuthPlugin.
const googleServicesJson = path.join(root, "app", "google-services.json");
if (fs.existsSync(googleServicesJson)) {
  const rootGroovy = path.join(root, "build.gradle");
  const rootKts = path.join(root, "build.gradle.kts");
  const appGroovy = path.join(root, "app", "build.gradle");
  const appKts = path.join(root, "app", "build.gradle.kts");

  if (fs.existsSync(rootGroovy)) {
    let rootText = fs.readFileSync(rootGroovy, "utf8");
    if (!rootText.includes("com.google.gms:google-services")) {
      if (/dependencies\s*\{/.test(rootText)) {
        rootText = rootText.replace(/dependencies\s*\{/, match => match + "\n        classpath 'com.google.gms:google-services:4.4.2'");
      } else {
        rootText = "buildscript { repositories { google(); mavenCentral() } dependencies { classpath 'com.google.gms:google-services:4.4.2' } }\n" + rootText;
      }
      fs.writeFileSync(rootGroovy, rootText);
    }
    if (fs.existsSync(appGroovy)) {
      let appText = fs.readFileSync(appGroovy, "utf8");
      if (!appText.includes("com.google.gms.google-services")) {
        appText += "\napply plugin: 'com.google.gms.google-services'\n";
        fs.writeFileSync(appGroovy, appText);
      }
    }
  } else if (fs.existsSync(rootKts)) {
    let rootText = fs.readFileSync(rootKts, "utf8");
    if (!rootText.includes("com.google.gms:google-services")) {
      if (/dependencies\s*\{/.test(rootText)) {
        rootText = rootText.replace(/dependencies\s*\{/, match => match + '\n        classpath("com.google.gms:google-services:4.4.2")');
      } else {
        rootText = 'buildscript { repositories { google(); mavenCentral() }; dependencies { classpath("com.google.gms:google-services:4.4.2") } }\n' + rootText;
      }
      fs.writeFileSync(rootKts, rootText);
    }
    if (fs.existsSync(appKts)) {
      let appText = fs.readFileSync(appKts, "utf8");
      if (!appText.includes("com.google.gms.google-services")) {
        appText += '\napply(plugin = "com.google.gms.google-services")\n';
        fs.writeFileSync(appKts, appText);
      }
    }
  }
}

// Final guard: ensure the custom Google Auth plugin is present in the exact Java source
// directory used by MainActivity before Gradle starts compiling the Android app.
const googleAuthFile = path.join(javaDir, "PaliaGoogleAuthPlugin.java");
fs.writeFileSync(googleAuthFile, googlePluginSource, "utf8");
const googleAuthWritten = fs.readFileSync(googleAuthFile, "utf8");
if (!googleAuthWritten.includes("package " + pkg + ";") ||
    !googleAuthWritten.includes("public class PaliaGoogleAuthPlugin extends Plugin")) {
  throw new Error("PaliaGoogleAuthPlugin.java was not generated correctly at " + googleAuthFile);
}
console.log("Verified custom Google Auth plugin: " + googleAuthFile);
