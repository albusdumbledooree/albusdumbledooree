package uz.flowi.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/*
 * FLOWI for Android phones and tablets: the business's FLOWI site (https://flowi.uz/c/<code>) in its own window.
 * Nothing of FLOWI is written again here — every update of the site reaches the app at once. What the app adds:
 * - the business is chosen once (its code), then the app opens straight on it;
 * - "Taom tayyor!" comes as a phone notification (with sound and vibration) when the app is in the background,
 *   and is said aloud with the phone's own voice (a phone's built-in browser window cannot speak by itself);
 * - camera (barcode scanner, selfie), location (attendance) and file choosing work inside;
 * - the screen stays on while the app is open; "back" never closes the app by accident;
 * - when the internet drops: a clear page that reconnects by itself.
 * Long press on "back" (or the button on the offline page) opens the choice of business again.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "flowi";
    private static final String DEFAULT_HOST = "https://flowi.uz";
    private static final int REQ_FILE = 11, REQ_PERM = 12;
    private static final String CHANNEL = "ready";

    private WebView web;
    private SharedPreferences prefs;
    private boolean visible = false;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingWebPerm;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private int notifyId = 100;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        makeChannel();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#071726"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " FLOWI-Android/" + versionName());
        web.addJavascriptInterface(new Bridge(), "FlowiAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        tts = new TextToSpeech(this, status -> ttsReady = status == TextToSpeech.SUCCESS);
        askNotificationPermission();
        if (saved != null) web.restoreState(saved); else openSite();
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1"; }
    }

    private String siteUrl() { return prefs.getString("url", ""); }

    private void openSite() {
        String url = siteUrl();
        if (url.isEmpty()) web.loadUrl("file:///android_asset/setup.html");
        else web.loadUrl(url);
    }

    // "navruz" → https://flowi.uz/c/navruz; "flowi.uz/c/navruz/" or a full address is kept as it is.
    static String normalize(String v) {
        String s = v == null ? "" : v.trim();
        if (s.isEmpty()) return "";
        if (!s.contains(".") && !s.contains("/") && !s.contains(":")) return DEFAULT_HOST + "/c/" + s.toLowerCase(Locale.ROOT);
        if (!s.matches("(?i)^https?://.*")) s = "https://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private String origin(String url) {
        try { Uri u = Uri.parse(url); return u.getScheme() + "://" + u.getAuthority(); } catch (Exception e) { return ""; }
    }

    private boolean inside(String url) {
        if (url.startsWith("file:///android_asset/") || url.startsWith("about:")) return true;
        String o = origin(siteUrl());
        return !o.isEmpty() && url.startsWith(o);
    }

    // ---------- What the site can ask of the phone ----------
    private class Bridge {
        @JavascriptInterface public String getUrl() { return siteUrl(); }
        @JavascriptInterface public String version() { return versionName(); }
        @JavascriptInterface public void setUrl(String v) {
            final String url = normalize(v);
            prefs.edit().putString("url", url).apply();
            ui.post(() -> { web.clearHistory(); openSite(); });
        }
        // Whether a business code exists (asked from the phone itself: the setup page cannot read another site's answer).
        @JavascriptInterface public void check(String v) {
            // The program page answers for any code: the business itself is asked from /api/info (404 = no such code).
            final String site = normalize(v);
            final Uri su = Uri.parse(site);
            final java.util.List<String> seg = su.getPathSegments();
            final String url = seg.size() >= 2 && "c".equals(seg.get(seg.size() - 2))
                ? su.getScheme() + "://" + su.getAuthority() + "/api/info?code=" + Uri.encode(seg.get(seg.size() - 1)) : site;
            new Thread(() -> {
                int code;
                try {
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(10000); c.setReadTimeout(10000); c.setInstanceFollowRedirects(true);
                    code = c.getResponseCode(); c.disconnect();
                } catch (Exception e) { code = 0; }
                final int res = code;
                ui.post(() -> web.evaluateJavascript("window.onFlowiCheck && onFlowiCheck(" + res + ")", null));
            }).start();
        }
        @JavascriptInterface public void openSetup() { ui.post(() -> web.loadUrl("file:///android_asset/setup.html?change=1")); }
        @JavascriptInterface public void retry() { ui.post(MainActivity.this::openSite); }
        @JavascriptInterface public boolean isVisible() { return visible; }
        // A notification only when the app is not on the screen (on the screen the site shows its own message).
        @JavascriptInterface public void notify(String title, String body) {
            if (!visible) ui.post(() -> showNotification(title, body));
        }
        @JavascriptInterface public void speak(String text, String lang) { ui.post(() -> say(text, lang)); }
        @JavascriptInterface public void vibrate() { ui.post(MainActivity.this::buzz); }
    }

    private void say(String text, String lang) {
        if (!ttsReady || text == null) return;
        // Uzbek is rarely on phones: Turkish reads Uzbek Latin well, then Russian.
        String[] order = "ru".equals(lang) ? new String[] {"ru"} : "en".equals(lang) ? new String[] {"en"} : new String[] {"uz", "tr", "ru"};
        for (String l : order) {
            int r = tts.setLanguage(new Locale(l));
            if (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED) break;
        }
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, "flowi" + System.currentTimeMillis());
    }

    private void buzz() {
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[] {0, 250, 120, 250}, -1));
        else v.vibrate(new long[] {0, 250, 120, 250}, -1);
    }

    private void makeChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Taom tayyor", NotificationManager.IMPORTANCE_HIGH);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 250, 120, 250});
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    private void showNotification(String title, String body) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body).setAutoCancel(true).setContentIntent(pi)
            .setColor(Color.parseColor("#2156E8")).setStyle(new Notification.BigTextStyle().bigText(body));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(notifyId++, b.build()); } catch (SecurityException ignored) { }
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
        }
    }

    // ---------- Pages ----------
    private class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return route(r.getUrl().toString()); }
        @SuppressWarnings("deprecation")
        @Override public boolean shouldOverrideUrlLoading(WebView v, String url) { return route(url); }
        private boolean route(String url) {
            if (inside(url)) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (ActivityNotFoundException ignored) { }
            return true;
        }
        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame()) offline();
        }
        @SuppressWarnings("deprecation")
        @Override public void onReceivedError(WebView v, int code, String desc, String url) {
            if (Build.VERSION.SDK_INT < 23) offline();
        }
    }

    private void offline() { ui.post(() -> web.loadUrl("file:///android_asset/offline.html")); }

    private class Chrome extends WebChromeClient {
        // Camera and microphone for the site itself (barcode scanner, selfie at attendance).
        @Override public void onPermissionRequest(PermissionRequest req) {
            ui.post(() -> {
                if (!inside(req.getOrigin().toString())) { req.deny(); return; }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { req.grant(req.getResources()); return; }
                pendingWebPerm = req;
                requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_PERM);
            });
        }
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            if (!inside(origin)) { cb.invoke(origin, false, false); return; }
            if (Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { cb.invoke(origin, true, false); return; }
            pendingGeo = cb; pendingGeoOrigin = origin;
            requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERM);
        }
        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            try { startActivityForResult(p.createIntent(), REQ_FILE); } catch (ActivityNotFoundException e) { fileCallback = null; return false; }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (pendingWebPerm != null) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) pendingWebPerm.grant(pendingWebPerm.getResources());
            else pendingWebPerm.deny();
            pendingWebPerm = null;
        }
        if (pendingGeo != null) {
            boolean ok = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            pendingGeo.invoke(pendingGeoOrigin, ok, false);
            pendingGeo = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    // ---------- Back button: inside the site first; never closes the app by accident ----------
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){var m=document.querySelector('.modal-back');if(m){if(window.closeModal)closeModal();else m.remove();return 'modal';}"
            + "if(location.hash&&location.hash!=='#/'&&location.hash!=='#/rooms'&&location.hash!=='#/pos'&&location.hash!=='#/lock'){history.back();return 'back';}return 'root';})()", r -> {
            if (r != null && r.contains("root")) moveTaskToBack(true);
        });
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            new AlertDialog.Builder(this).setTitle("FLOWI").setMessage("Biznes manzilini o'zgartirasizmi?\nХотите сменить адрес заведения?")
                .setPositiveButton("Ha / Да", (d, w) -> web.loadUrl("file:///android_asset/setup.html?change=1"))
                .setNegativeButton("Yo'q / Нет", null).show();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) { event.startTracking(); return true; }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.isTracking() && !event.isCanceled()) { onBackPressed(); return true; }
        return super.onKeyUp(keyCode, event);
    }

    // The site keeps running in the background (its live connection brings "Taom tayyor"); only the flag changes.
    @Override protected void onResume() { super.onResume(); visible = true; web.evaluateJavascript("window.dispatchEvent(new Event('flowi-visible'))", null); }
    @Override protected void onPause() { super.onPause(); visible = false; }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onDestroy() { if (tts != null) tts.shutdown(); web.destroy(); super.onDestroy(); }
}
