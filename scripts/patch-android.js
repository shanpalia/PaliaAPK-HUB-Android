const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), "android");
const pkg = "com.shanpalia.paliaapkhub";
const javaDir = path.join(root, "app/src/main/java/com/shanpalia/paliaapkhub");

fs.mkdirSync(javaDir, { recursive: true });

const plugin = `package ${pkg};

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.database.Cursor;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "PaliaDownloader")
public class PaliaDownloaderPlugin extends Plugin {

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "PaliaAPK-HUB-App.apk");

        if (url == null || url.isEmpty()) {
            call.reject("Download URL is missing");
            return;
        }

        DownloadManager dm = (DownloadManager)
                getContext().getSystemService(Context.DOWNLOAD_SERVICE);

        DownloadManager.Request request =
                new DownloadManager.Request(Uri.parse(url));

        request.setTitle(filename);
        request.setDescription("PaliaAPK HUB APK download");
        request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS, filename);

        long downloadId = dm.enqueue(request);

        JSObject result = new JSObject();
        result.put("downloadId", downloadId);
        call.resolve(result);

        Handler handler = new Handler(Looper.getMainLooper());
        Runnable progressRunnable = new Runnable() {
            @Override
            public void run() {
                Cursor cursor = dm.query(
                        new DownloadManager.Query().setFilterById(downloadId));

                if (cursor == null) {
                    return;
                }

                try {
                    if (cursor.moveToFirst()) {
                        int status = cursor.getInt(
                                cursor.getColumnIndexOrThrow(
                                        DownloadManager.COLUMN_STATUS));
                        long downloaded = cursor.getLong(
                                cursor.getColumnIndexOrThrow(
                                        DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = cursor.getLong(
                                cursor.getColumnIndexOrThrow(
                                        DownloadManager.COLUMN_TOTAL_SIZE_BYTES));

                        JSObject progress = new JSObject();
                        progress.put("downloadId", downloadId);
                        progress.put("downloadedBytes", downloaded);
                        progress.put("totalBytes", total);
                        progress.put("timestampMs", android.os.SystemClock.elapsedRealtime());
                        notifyListeners("downloadProgress", progress);

                        if (status == DownloadManager.STATUS_PENDING
                                || status == DownloadManager.STATUS_RUNNING) {
                            handler.postDelayed(this, 400);
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        };

        handler.post(progressRunnable);
    }
}
`;

fs.writeFileSync(
    path.join(javaDir, "PaliaDownloaderPlugin.java"),
    plugin
);

const mainJava = path.join(javaDir, "MainActivity.java");
const mainKotlin = path.join(javaDir, "MainActivity.kt");

if (fs.existsSync(mainJava)) {
    let source = fs.readFileSync(mainJava, "utf8");

    if (!source.includes("PaliaDownloaderPlugin")) {
        source = source.replace(
            "import com.getcapacitor.BridgeActivity;",
            "import com.getcapacitor.BridgeActivity;\nimport com.shanpalia.paliaapkhub.PaliaDownloaderPlugin;"
        );

        source = source.replace(
            "public class MainActivity extends BridgeActivity {",
            "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        registerPlugin(PaliaDownloaderPlugin.class);\n    }"
        );
    }

    fs.writeFileSync(mainJava, source);
} else if (fs.existsSync(mainKotlin)) {
    let source = fs.readFileSync(mainKotlin, "utf8");

    if (!source.includes("PaliaDownloaderPlugin")) {
        source = source.replace(
            "import com.getcapacitor.BridgeActivity",
            "import com.getcapacitor.BridgeActivity\nimport com.shanpalia.paliaapkhub.PaliaDownloaderPlugin"
        );

        source = source.replace(
            "class MainActivity : BridgeActivity()",
            "class MainActivity : BridgeActivity() {\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        super.onCreate(savedInstanceState)\n        bridge.registerPlugin(PaliaDownloaderPlugin::class.java)\n    }"
        );
    }

    fs.writeFileSync(mainKotlin, source);
}

const props = path.join(root, "gradle.properties");
if (fs.existsSync(props)) {
    let source = fs.readFileSync(props, "utf8");
    if (!source.includes("android.useAndroidX=true")) {
        source += "\nandroid.useAndroidX=true\n";
    }
    if (!source.includes("android.enableJetifier=true")) {
        source += "android.enableJetifier=true\n";
    }
    fs.writeFileSync(props, source);
}

const manifest = path.join(root, "app/src/main/AndroidManifest.xml");
if (fs.existsSync(manifest)) {
    let source = fs.readFileSync(manifest, "utf8");

    const internetPermission =
        '<uses-permission android:name="android.permission.INTERNET" />';
    const installPermission =
        '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />';

    if (!source.includes(internetPermission)) {
        source = source.replace("</manifest>", "    " + internetPermission + "\n</manifest>");
    }

    if (!source.includes(installPermission)) {
        source = source.replace("</manifest>", "    " + installPermission + "\n</manifest>");
    }

    fs.writeFileSync(manifest, source);
}

if (fs.existsSync(manifest)) { let s=fs.readFileSync(manifest,"utf8"); if(!s.includes("PaliaDownloadReceiver")) s=s.replace("</application>","<receiver android:name=\".PaliaDownloadReceiver\" android:exported=\"false\"><intent-filter><action android:name=\"android.intent.action.DOWNLOAD_COMPLETE\"/></intent-filter></receiver></application>"); s=s.replace("<application","<application android:icon=\"@drawable/ic_palia_logo\" android:roundIcon=\"@drawable/ic_palia_logo\""); fs.writeFileSync(manifest,s); }
console.log("patched Android native downloader, install flow and launcher icon");

// PaliaAPK HUB launcher icon and APK completion receiver are generated here.
const res = path.join(root, "app/src/main/res");
for (const d of ["drawable", "mipmap-anydpi-v26", "values"]) fs.mkdirSync(path.join(res,d), {recursive:true});
fs.writeFileSync(path.join(res,"drawable","ic_palia_logo.xml"), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#16A34A" android:pathData="M54,2A52,52 0,1 0,54 106A52,52 0,1 0,54 2"/><path android:fillColor="#FFFFFF" android:pathData="M31,25h27c13,0 21,7 21,18s-8,18-21,18H44v22H31V25M44,36v14h13c6,0 9,-2 9,-7s-3,-7-9,-7H44"/><path android:fillColor="#FFFFFF" android:pathData="M54,66l-10,10h7v10h6V76h7z"/></vector>`);
fs.writeFileSync(path.join(res,"mipmap-anydpi-v26","ic_launcher.xml"), `<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_bg"/><foreground android:drawable="@drawable/ic_palia_logo"/></adaptive-icon>`);
fs.writeFileSync(path.join(res,"mipmap-anydpi-v26","ic_launcher_round.xml"), `<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_bg"/><foreground android:drawable="@drawable/ic_palia_logo"/></adaptive-icon>`);
fs.writeFileSync(path.join(res,"values","palia_colors.xml"), `<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_bg">#16A34A</color></resources>`);
const receiver = `package com.shanpalia.paliaapkhub;
import android.app.DownloadManager;import android.content.*;import android.net.Uri;
public class PaliaDownloadReceiver extends BroadcastReceiver { public void onReceive(Context c, Intent i){ if(!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(i.getAction())) return; long id=i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1); if(id<0)return; long active=c.getSharedPreferences("palia_downloads", Context.MODE_PRIVATE).getLong("active_id",-1); if(id!=active)return; DownloadManager dm=(DownloadManager)c.getSystemService(Context.DOWNLOAD_SERVICE); Uri uri=dm.getUriForDownloadedFile(id); if(uri==null)return; Intent open=new Intent(Intent.ACTION_VIEW);open.setDataAndType(uri,"application/vnd.android.package-archive");open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);try{c.startActivity(open);}catch(Exception ignored){} } }`;
fs.writeFileSync(path.join(dir,"PaliaDownloadReceiver.java"),receiver);const newPlugin = `package com.shanpalia.paliaapkhub;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Environment;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
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
        if (url == null || url.isEmpty()) { call.reject("Download URL is missing"); return; }
        if (downloading) { call.reject("A download is already running"); return; }

        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        downloadedFile = new File(dir, filename);
        downloading = true;

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection)new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "PaliaAPK-HUB-Android");
                connection.connect();

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new IOException("HTTP " + code);

                long total = connection.getContentLengthLong();
                try (InputStream in = new BufferedInputStream(connection.getInputStream());
                     OutputStream out = new BufferedOutputStream(new FileOutputStream(downloadedFile))) {
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    int n;
                    long lastTime = android.os.SystemClock.elapsedRealtime();
                    long lastBytes = 0;

                    while ((n = in.read(buffer)) != -1) {
                        out.write(buffer, 0, n);
                        done += n;
                        long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastTime >= 250) {
                            JSObject p = new JSObject();
                            p.put("downloadedBytes", done);
                            p.put("totalBytes", total);
                            p.put("timestampMs", now);
                            p.put("speedBytesPerSecond", (done-lastBytes) * 1000.0 / Math.max(1, now-lastTime));
                            p.put("status", "downloading");
                            notifyListeners("downloadProgress", p);
                            lastTime = now;
                            lastBytes = done;
                        }
                    }
                }

                JSObject p = new JSObject();
                p.put("downloadedBytes", downloadedFile.length());
                p.put("totalBytes", downloadedFile.length());
                p.put("timestampMs", android.os.SystemClock.elapsedRealtime());
                p.put("speedBytesPerSecond", 0);
                p.put("status", "completed");
                p.put("filename", downloadedFile.getName());
                notifyListeners("downloadProgress", p);
                call.resolve(p);
            } catch (Exception e) {
                if (downloadedFile != null && downloadedFile.exists()) downloadedFile.delete();
                call.reject("Download failed: " + e.getMessage());
            } finally {
                downloading = false;
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void openDownloadedApk(PluginCall call) {
        if (downloadedFile == null || !downloadedFile.exists()) {
            call.reject("APK is not ready"); return;
        }
        try {
            Uri uri = Uri.parse("file://" + downloadedFile.getAbsolutePath());
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) { call.reject("Unable to open APK installer: " + e.getMessage()); }
    }
}

