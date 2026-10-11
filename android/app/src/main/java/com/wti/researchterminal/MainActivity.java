package com.wti.researchterminal;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Lightweight and installable Android WebView shell for the user's GitHub Pages dashboard.
 * UI and price analytics are loaded from the live site; updating GitHub Pages updates the app.
 *
 * Debug APK is built and signed with the GitHub Actions debug key.
 * Never confuse the CI debug build with a production keystore-signed Play Store release.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://jskimlam.github.io/WTI-Research-Terminal/";
    private static final int CSV_PICKER = 91;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    private boolean isAppUrl(Uri uri) {
        if (uri == null) return false;
        final String path = uri.getPath();
        return "https".equalsIgnoreCase(uri.getScheme())
                && "jskimlam.github.io".equalsIgnoreCase(uri.getHost())
                && path != null
                && (path.equals("/WTI-Research-Terminal")
                    || path.startsWith("/WTI-Research-Terminal/"));
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 22, 40));
        getWindow().setNavigationBarColor(Color.rgb(7, 22, 40));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(6, 18, 32));
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        final WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Required for charts and local technical indicators.
        settings.setDomStorageEnabled(true); // Required for PWA offline storage.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Android document picker.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new CsvBridge(), "WTIAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (isAppUrl(target)) return false;
                openExternally(target);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this,
                            "네트워크 연결을 확인하세요. 처음 실행에는 인터넷이 필요합니다.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view, ValueCallback<Uri[]> newCallback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = newCallback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*"); // File providers commonly label CSV as text/plain or Excel.
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"
                });
                try {
                    startActivityForResult(Intent.createChooser(intent, "WTI CSV 파일 선택"), CSV_PICKER);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "CSV 파일 선택기를 열 수 없습니다.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri target = Uri.parse(url);
            if (!"https".equalsIgnoreCase(target.getScheme())) return;
            try {
                DownloadManager.Request request = new DownloadManager.Request(target);
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                        URLUtil.guessFileName(url, contentDisposition, mimeType));
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (manager != null) manager.enqueue(request);
            } catch (Exception error) {
                openExternally(target);
            }
        });

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(HOME);
    }

    private void openExternally(Uri uri) {
        if (uri == null) return;
        if (!"https".equalsIgnoreCase(uri.getScheme())
                && !"http".equalsIgnoreCase(uri.getScheme())
                && !"mailto".equalsIgnoreCase(uri.getScheme())) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (Exception ignored) {
            Toast.makeText(this, "해당 링크를 열 앱이 없습니다.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Narrow native file writer for CSV files generated by the trusted GitHub Pages app. */
    private class CsvBridge {
        @JavascriptInterface
        public void saveCsv(String name, String contents) {
            if (contents == null || contents.length() > 2_000_000) return;
            final String safeName = (name == null ? "wti-export.csv" : name)
                    .replaceAll("[^a-zA-Z0-9._-]", "_");
            final String filename = safeName.endsWith(".csv") ? safeName : "wti-export.csv";
            final String text = contents;
            runOnUiThread(() -> {
                try {
                    final byte[] bytes = ("\uFEFF" + text).getBytes(StandardCharsets.UTF_8);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                        values.put(MediaStore.Downloads.MIME_TYPE, "text/csv");
                        values.put(MediaStore.Downloads.RELATIVE_PATH,
                                Environment.DIRECTORY_DOWNLOADS + "/WTI Research Terminal");
                        Uri uri = getContentResolver().insert(
                                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new Exception("MediaStore destination unavailable");
                        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                            if (output == null) throw new Exception("File output unavailable");
                            output.write(bytes);
                        }
                        Toast.makeText(MainActivity.this,
                                "다운로드/WTI Research Terminal에 저장했습니다.",
                                Toast.LENGTH_LONG).show();
                    } else {
                        File folder = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        if (folder == null) throw new Exception("Download folder unavailable");
                        File file = new File(folder, filename);
                        try (OutputStream output = new FileOutputStream(file)) {
                            output.write(bytes);
                        }
                        Toast.makeText(MainActivity.this,
                                "앱 전용 다운로드 폴더에 저장했습니다.",
                                Toast.LENGTH_LONG).show();
                    }
                } catch (Exception ex) {
                    Toast.makeText(MainActivity.this,
                            "CSV 저장 오류: " + ex.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CSV_PICKER && fileCallback != null) {
            Uri[] selected = resultCode == RESULT_OK && data != null && data.getData() != null
                    ? new Uri[]{data.getData()} : null;
            fileCallback.onReceiveValue(selected);
            fileCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("WTIAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
