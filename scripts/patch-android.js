const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), "android");
const pkg = "com.shanpalia.paliaapkhub";
const javaDir = path.join(root, "app/src/main/java/com/shanpalia/paliaapkhub");
const res = path.join(root, "app/src/main/res");

fs.mkdirSync(javaDir, { recursive: true });
for (const d of ["drawable", "mipmap-anydpi-v26", "values", "xml"]) {
  fs.mkdirSync(path.join(res, d), { recursive: true });
}

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
  if (!source.includes("android.useAndroidX=true")) source += "\nandroid.useAndroidX=true\n";
  if (!source.includes("android.enableJetifier=true")) source += "android.enableJetifier=true\n";
  fs.writeFileSync(props, source);
}

const appGradle = path.join(root, "app/build.gradle");
if (fs.existsSync(appGradle)) {
  let gradle = fs.readFileSync(appGradle, "utf8");
  if (!gradle.includes("androidx.core:core:")) {
    gradle = gradle.replace(/dependencies\s*\{/m, `dependencies {\n    implementation "androidx.core:core:1.13.1"`);
  }
  fs.writeFileSync(appGradle, gradle);
}

const manifest = path.join(root, "app/src/main/AndroidManifest.xml");
if (fs.existsSync(manifest)) {
  let source = fs.readFileSync(manifest, "utf8");

  const addPermission = (permission) => {
    if (!source.includes(permission)) {
      source = source.replace(
        "</manifest>",
        `    ${permission}\n</manifest>`
      );
    }
  };

  addPermission('<uses-permission android:name="android.permission.INTERNET" />');
  addPermission('<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />');

  // Remove the old DownloadManager receiver if a previous generated project had it.
  source = source.replace(
    /\s*<receiver android:name="\.PaliaDownloadReceiver"[^>]*>.*?<\/receiver>/gs,
    ""
  );

  // Add FileProvider for the app-private APK file.
  if (!source.includes(".fileprovider")) {
    source = source.replace(
      "</application>",
      `        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${pkg}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/palia_file_paths" />
        </provider>
</application>`
    );
  }

  source = source.replace(
    /<application\b([^>]*)>/,
    (match, attrs) => {
      let next = attrs
        .replace(/\s+android:icon="[^"]*"/g, "")
        .replace(/\s+android:roundIcon="[^"]*"/g, "");
      return `<application${next} android:icon="@drawable/ic_palia_android" android:roundIcon="@drawable/ic_palia_android">`;
    }
  );

  fs.writeFileSync(manifest, source);
}

fs.writeFileSync(
  path.join(res, "drawable", "ic_palia_android.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#40D88B" android:pathData="M6,82C8,50 31,27 54,27s46,23 48,55H6Z"/>
    <path android:strokeColor="#40D88B" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M28,27L21,16M80,27L87,16"/>
    <path android:fillColor="#FFFFFF" android:pathData="M38,51A4,4 0,1 0,38,59A4,4 0,1 0,38,51M70,51A4,4 0,1 0,70,59A4,4 0,1 0,70,51"/>
</vector>`
);

fs.writeFileSync(
  path.join(res, "drawable", "ic_palia_logo.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#40D88B" android:pathData="M6,82C8,50 31,27 54,27s46,23 48,55H6Z"/><path android:strokeColor="#40D88B" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M28,27L21,16M80,27L87,16"/><path android:fillColor="#FFFFFF" android:pathData="M38,51A4,4 0,1 0,38,59A4,4 0,1 0,38,51M70,51A4,4 0,1 0,70,59A4,4 0,1 0,70,51"/></vector>`
);

fs.writeFileSync(
  path.join(res, "values", "palia_colors.xml"),
  `<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_bg">#16A34A</color></resources>`
);

fs.writeFileSync(
  path.join(res, "mipmap-anydpi-v26", "ic_launcher.xml"),
  `<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_bg"/><foreground android:drawable="@drawable/ic_palia_logo"/></adaptive-icon>`
);

fs.writeFileSync(
  path.join(res, "mipmap-anydpi-v26", "ic_launcher_round.xml"),
  `<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_bg"/><foreground android:drawable="@drawable/ic_palia_logo"/></adaptive-icon>`
);

fs.writeFileSync(
  path.join(res, "xml", "palia_file_paths.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path
        name="palia_apk_downloads"
        path="Download/" />
</paths>`
);

console.log("patched Android native downloader, FileProvider installer, permissions and launcher icon");

const googleJava = path.join(javaDir, "PaliaGoogleAuthPlugin.java");
fs.writeFileSync(googleJava, [
'package ' + pkg + ';',
'',
'import android.os.CancellationSignal;',
'import androidx.annotation.NonNull;',
'import androidx.core.content.ContextCompat;',
'import androidx.credentials.Credential;',
'import androidx.credentials.CredentialManager;',
'import androidx.credentials.CredentialManagerCallback;',
'import androidx.credentials.GetCredentialRequest;',
'import androidx.credentials.GetCredentialResponse;',
'import androidx.credentials.exceptions.GetCredentialException;',
'import com.getcapacitor.JSObject;',
'import com.getcapacitor.Plugin;',
'import com.getcapacitor.PluginCall;',
'import com.getcapacitor.annotation.CapacitorPlugin;',
'import com.getcapacitor.PluginMethod;',
'import com.google.android.libraries.identity.googleid.GetGoogleIdOption;',
'import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;',
'',
'@CapacitorPlugin(name = "PaliaGoogleAuth")',
'public class PaliaGoogleAuthPlugin extends Plugin {',
'    private static final String WEB_CLIENT_ID = "H270953807883-btnln51tlh1e1b2dtjfo6bsoasjhoc3s.apps.googleusercontent.com";',
'',
'    @PluginMethod',
'    public void signIn(PluginCall call) {',
'        try {',
'            GetGoogleIdOption option = new GetGoogleIdOption.Builder()',
'                    .setServerClientId(WEB_CLIENT_ID)',
'                    .setFilterByAuthorizedAccounts(false)',
'                    .setAutoSelectEnabled(true)',
'                    .build();',
'            GetCredentialRequest request = new GetCredentialRequest.Builder()',
'                    .addCredentialOption(option)',
'                    .build();',
'            CredentialManager manager = CredentialManager.create(getActivity());',
'            manager.getCredentialAsync(getActivity(), request, new CancellationSignal(),',
'                    ContextCompat.getMainExecutor(getActivity()),',
'                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {',
'                        @Override public void onResult(@NonNull GetCredentialResponse response) {',
'                            try {',
'                                Credential credential = response.getCredential();',
'                                if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {',
'                                    call.reject("Google account credential was not returned."); return;',
'                                }',
'                                GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());',
'                                JSObject result = new JSObject();',
'                                result.put("idToken", google.getIdToken());',
'                                result.put("displayName", google.getDisplayName());',
'                                result.put("givenName", google.getGivenName());',
'                                result.put("familyName", google.getFamilyName());',
'                                result.put("email", google.getId());',
'                                result.put("photoUrl", google.getProfilePictureUri() == null ? null : google.getProfilePictureUri().toString());',
'                                call.resolve(result);',
'                            } catch (Exception e) { call.reject("Unable to read Google account: " + e.getMessage()); }',
'                        }',
'                        @Override public void onError(@NonNull GetCredentialException e) {',
'                            call.reject("Google sign-in failed: " + e.getMessage());',
'                        }',
'                    });',
'        } catch (Exception e) { call.reject("Google sign-in could not start: " + e.getMessage()); }',
'    }',
'}'
].join("\n"));

if (fs.existsSync(mainJava)) {
  let source = fs.readFileSync(mainJava, "utf8");
  if (!source.includes("PaliaGoogleAuthPlugin")) {
    source = source.replace("import com.shanpalia.paliaapkhub.PaliaDownloaderPlugin;", "import com.shanpalia.paliaapkhub.PaliaDownloaderPlugin;\nimport com.shanpalia.paliaapkhub.PaliaGoogleAuthPlugin;");
    source = source.replace("registerPlugin(PaliaDownloaderPlugin.class);", "registerPlugin(PaliaDownloaderPlugin.class);\n        registerPlugin(PaliaGoogleAuthPlugin.class);");
    fs.writeFileSync(mainJava, source);
  }
} else if (fs.existsSync(mainKotlin)) {
  let source = fs.readFileSync(mainKotlin, "utf8");
  if (!source.includes("PaliaGoogleAuthPlugin")) {
    source = source.replace("import com.shanpalia.paliaapkhub.PaliaDownloaderPlugin", "import com.shanpalia.paliaapkhub.PaliaDownloaderPlugin\nimport com.shanpalia.paliaapkhub.PaliaGoogleAuthPlugin");
    source = source.replace("bridge.registerPlugin(PaliaDownloaderPlugin::class.java)", "bridge.registerPlugin(PaliaDownloaderPlugin::class.java)\n        bridge.registerPlugin(PaliaGoogleAuthPlugin::class.java)");
    fs.writeFileSync(mainKotlin, source);
  }
}

if (fs.existsSync(appGradle)) {
  let gradle = fs.readFileSync(appGradle, "utf8");
  if (!gradle.includes("androidx.credentials:credentials:")) {
    gradle = gradle.replace(/dependencies\s*\{/m, 'dependencies {\n    implementation "androidx.credentials:credentials:1.3.0"\n    implementation "androidx.credentials:credentials-play-services-auth:1.3.0"\n    implementation "com.google.android.libraries.identity.googleid:googleid:1.1.1"');
  }
  fs.writeFileSync(appGradle, gradle);
}
