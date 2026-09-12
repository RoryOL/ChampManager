package ie.clare.champmanager;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final int CONNECT_TIMEOUT_MS = 20000;
    private static final int READ_TIMEOUT_MS = 60000;
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_TEXT_BYTES = 256_000;
    private static final String USER_AGENT = "CaptureTheCanon-Updater";

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            result.put("versionCode", versionCode(info));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read the installed app version.", error);
        }
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canRequestInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url");
        if (!isAllowedUpdateUrl(url)) {
            call.reject("Update URL is not GitHub.");
            return;
        }
        new Thread(() -> {
            try {
                JSObject result = new JSObject();
                result.put("text", downloadText(url));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not reach GitHub.", error);
            }
        }, "app-update-check").start();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (!isAllowedUpdateUrl(url)) {
            call.reject("Update URL is not GitHub.");
            return;
        }
        if (!canRequestInstalls()) {
            call.reject("Android needs permission to install updates.", "NEED_PERMISSION");
            return;
        }
        new Thread(() -> {
            File apk = new File(getContext().getCacheDir(), "ChampManager-update.apk");
            try {
                downloadFile(url, apk);
                android.app.Activity activity = getActivity();
                if (activity == null) {
                    call.reject("The app was closed before the update could install.");
                    return;
                }
                activity.runOnUiThread(() -> {
                    try {
                        startInstall(apk);
                        call.resolve();
                    } catch (Exception error) {
                        call.reject("Could not open the Android installer.", error);
                    }
                });
            } catch (Exception error) {
                call.reject("Could not download the GitHub APK.", error);
            }
        }, "app-update-download").start();
    }

    public static boolean isAllowedUpdateUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            URI uri = URI.create(url);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase(Locale.US);
            return host.equals("github.com")
                || host.equals("raw.githubusercontent.com")
                || host.endsWith(".githubusercontent.com");
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean canRequestInstalls() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private long versionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.getLongVersionCode();
        }
        return info.versionCode;
    }

    private String downloadText(String spec) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = open(spec, MAX_REDIRECTS);
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException("GitHub returned HTTP " + code);
            }
            InputStream input = connection.getInputStream();
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_TEXT_BYTES) {
                    throw new IOException("GitHub response was too large.");
                }
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void downloadFile(String spec, File target) throws IOException {
        HttpURLConnection connection = null;
        FileOutputStream output = null;
        try {
            connection = open(spec, MAX_REDIRECTS);
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException("GitHub returned HTTP " + code);
            }
            String contentType = connection.getContentType();
            if (contentType != null && contentType.toLowerCase(Locale.US).contains("text/html")) {
                throw new IOException("GitHub returned a web page instead of the APK.");
            }
            long total = contentLength(connection);
            if (target.exists() && !target.delete()) {
                throw new IOException("Could not replace the previous download.");
            }
            InputStream input = connection.getInputStream();
            output = new FileOutputStream(target);
            byte[] buffer = new byte[16384];
            long received = 0;
            long lastNotify = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                received += read;
                if (received - lastNotify >= 131072 || (total > 0 && received >= total)) {
                    lastNotify = received;
                    notifyProgress(received, total);
                }
            }
            output.flush();
            notifyProgress(received, total > 0 ? total : received);
        } finally {
            if (output != null) {
                try {
                    output.close();
                } catch (IOException ignored) {
                    // already surfacing the download error
                }
            }
            if (connection != null) connection.disconnect();
        }
    }

    private long contentLength(HttpURLConnection connection) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return connection.getContentLengthLong();
        }
        return connection.getContentLength();
    }

    private void notifyProgress(long received, long total) {
        JSObject progress = new JSObject();
        progress.put("received", received);
        progress.put("total", Math.max(total, 0));
        notifyListeners("downloadProgress", progress);
    }

    private void startInstall(File apk) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        PackageManager packages = getContext().getPackageManager();
        List<ResolveInfo> handlers = packages.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
        for (ResolveInfo handler : handlers) {
            getContext().grantUriPermission(
                handler.activityInfo.packageName,
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        }
        getContext().startActivity(intent);
    }

    private HttpURLConnection open(String spec, int redirectsLeft) throws IOException {
        URL url = new URL(spec);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept", "*/*");
        int code = connection.getResponseCode();
        if (code >= 300 && code < 400 && redirectsLeft > 0) {
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || location.isEmpty()) {
                throw new IOException("GitHub redirected without a location.");
            }
            URL next = new URL(url, location);
            if (!isAllowedUpdateUrl(next.toString())) {
                throw new IOException("GitHub redirected off GitHub.");
            }
            return open(next.toString(), redirectsLeft - 1);
        }
        return connection;
    }
}
