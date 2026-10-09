const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), "android");
const pkg = "com.shanpalia.paliaapkhub";
const appGradle = path.join(root, "app/build.gradle");
const appGradleKts = path.join(root, "app/build.gradle.kts");
const javaDir = path.join(root, "app/src/main/java/com/shanpalia/paliaapkhub");
const res = path.join(root, "app/src/main/res");

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
  "com.google.android.libraries.identity.googleid:googleid:1.1.1"
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
