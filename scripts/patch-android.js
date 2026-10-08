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

    source = source.replace(
        /\s*<uses-permission[^>]+android\.permission\.INTERNET[^>]*\\/>/g,
        ""
    );
    source = source.replace(
        /\s*<uses-permission[^>]+android\.permission\.REQUEST_INSTALL_PACKAGES[^>]*\\/>/g,
        ""
    );

    source = source.replace(
        "</manifest>",
        "    <uses-permission android:name=\"android.permission.INTERNET\" />\n" +
        "    <uses-permission android:name=\"android.permission.REQUEST_INSTALL_PACKAGES\" />\n" +
        "</manifest>"
    );

    fs.writeFileSync(manifest, source);
}

console.log("patched Android native downloader");
