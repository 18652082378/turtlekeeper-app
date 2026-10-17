package com.turtlekeeper.app;

import static org.junit.Assert.*;
import android.Manifest;
import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Looper;
import android.os.SystemClock;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.shadows.ShadowWebView;

/** Native intents, permission variants and provider lifecycle. No production API traffic. */
@RunWith(RobolectricTestRunner.class) @Config(sdk = 35)
public class AndroidNativeBoundaryTest {
    ActivityController<TestActivity> controller;
    MainActivity activity;
    @com.getcapacitor.annotation.CapacitorPlugin(name = "TurtleAndroidFiles")
    public static class TestFilesPlugin extends TurtleAndroidFilesPlugin {
        @Override Uri shareUri(java.io.File file, String name) {
            // AndroidX FileProvider's Unix canonical-path matching does not work
            // on this Windows host. Mock only URI creation, not image validation,
            // cache writes, chooser launch, grant flags or bridge callbacks.
            assertTrue(file.exists());
            return Uri.parse("content://com.turtlekeeper.app.fileprovider/my_cache_images/turtle_exports/" + file.getName());
        }
    }
    public static class TestActivity extends AndroidTypographyTest.TestActivity {
        @Override protected void load() { registerPlugin(TestFilesPlugin.class); super.load(); }
    }
    @Before public void setup() {
        PackageInfo provider = new PackageInfo(); provider.packageName = "com.android.webview"; provider.versionName = "130.0.0.0";
        ShadowWebView.setCurrentWebViewPackage(provider);
        controller = Robolectric.buildActivity(TestActivity.class).setup(); activity = controller.get();
    }
    @After public void teardown() { controller.close(); }
    static class Call extends PluginCall {
        volatile JSObject result; volatile String error;
        Call(String plugin, String method, JSObject args) { super(null, plugin, "test", method, args); }
        @Override public void resolve(JSObject value) { result = value; }
        @Override public void resolve() { result = new JSObject(); }
        @Override public void reject(String message, String code, Exception exception, JSObject value) { error = message + (exception == null ? "" : ": " + exception); }
    }
    private void await(BooleanSupplier condition) throws Exception {
        for (int i = 0; i < 300 && !condition.getAsBoolean(); i++) { Shadows.shadowOf(Looper.getMainLooper()).idle(); Thread.sleep(10); }
        Shadows.shadowOf(Looper.getMainLooper()).idle(); assertTrue("Native callback timed out", condition.getAsBoolean());
    }
    private TurtleAndroidFilesPlugin files() { return (TurtleAndroidFilesPlugin) activity.getBridge().getPlugin("TurtleAndroidFiles").getInstance(); }
    private TurtleAndroidLocationPlugin location() { return (TurtleAndroidLocationPlugin) activity.getBridge().getPlugin("TurtleAndroidLocation").getInstance(); }
    private Call export(String content) throws Exception {
        JSObject args = new JSObject(); args.put("filename", "经营报表.csv"); args.put("content", content);
        Call call = new Call("TurtleAndroidFiles", "exportText", args); files().exportText(call);
        await(() -> call.getString("_exportFile") != null || call.error != null);
        assertNull(call.error); return call;
    }
    @Test public void documentSaveWaitsForWriteAndPreservesUtf8() throws Exception {
        String content = "\ufeff类型,金额\n损耗,450";
        Call call = export(content);
        assertNull("Opening save UI is not a successful save", call.result);
        assertFalse("Do not save large bridge payload in activity state", call.getData().has("content"));
        Intent launched = Shadows.shadowOf(activity).getNextStartedActivityForResult().intent;
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, launched.getAction()); assertEquals("text/csv", launched.getType());
        Uri uri = Uri.parse("content://test/export.csv"); ByteArrayOutputStream output = new ByteArrayOutputStream();
        Shadows.shadowOf(activity.getContentResolver()).registerOutputStream(uri, output);
        files().documentResult(call, new ActivityResult(Activity.RESULT_OK, new Intent().setData(uri)));
        await(() -> call.result != null || call.error != null);
        assertNull(call.error); assertTrue(call.result.getBoolean("saved"));
        assertEquals(content, output.toString(StandardCharsets.UTF_8.name()));
        assertFalse(new java.io.File(activity.getCacheDir(), "turtle_exports/" + call.getString("_exportFile")).exists());
    }
    @Test public void documentCancellationAndMissingDestinationNeverReportSaved() throws Exception {
        Call cancelled = export("{}"); files().documentResult(cancelled, new ActivityResult(Activity.RESULT_CANCELED, null));
        await(() -> cancelled.result != null); assertTrue(cancelled.result.getBoolean("cancelled")); assertFalse(cancelled.result.has("saved"));
        Call invalid = export("{}"); files().documentResult(invalid, new ActivityResult(Activity.RESULT_OK, new Intent()));
        await(() -> invalid.error != null); assertNull(invalid.result);
    }
    @Test public void secondExportCannotReplacePendingDestination() throws Exception {
        Call first = export("first");
        Call second = new Call("TurtleAndroidFiles", "exportText", new JSObject()); files().exportText(second);
        assertNotNull(second.error); assertNull(second.result);
        files().documentResult(first, new ActivityResult(Activity.RESULT_CANCELED, null)); await(() -> first.result != null);
    }
    @Test public void unsafeFilenameCannotEscapeCacheDirectory() {
        String name = TurtleAndroidFilesPlugin.safeName("../../a\n.csv", "backup.csv");
        assertFalse(name.contains("/")); assertFalse(name.contains("\n")); assertEquals("backup.csv", TurtleAndroidFilesPlugin.safeName("..", "backup.csv"));
    }
    @Test public void invalidImageNeverLaunchesShareOrReportsSuccess() throws Exception {
        JSObject args = new JSObject(); args.put("dataUrl", "data:image/png;base64,bm90YW5pbWFnZQ==");
        Call call = new Call("TurtleAndroidFiles", "shareImage", args); files().shareImage(call);
        await(() -> call.error != null); assertNull(call.result);
        assertNull(Shadows.shadowOf(activity).getNextStartedActivityForResult());
    }
    @Test public void imageShareGrantsReadAccessWithoutClaimingDelivery() throws Exception {
        // Real PNG bytes: Robolectric's legacy Bitmap.compress writes a test stub.
        JSObject args = new JSObject(); args.put("filename", "成长卡.png"); args.put("dataUrl", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA8sAAAAASUVORK5CYII=");
        Call call = new Call("TurtleAndroidFiles", "shareImage", args); files().shareImage(call);
        await(() -> call.result != null || call.error != null); assertNull(call.error); assertTrue(call.result.getBoolean("opened")); assertFalse(call.result.has("saved"));
        Intent chooser = Shadows.shadowOf(activity).getNextStartedActivity(); assertEquals(Intent.ACTION_CHOOSER, chooser.getAction());
        Intent send = chooser.getParcelableExtra(Intent.EXTRA_INTENT); assertEquals(Intent.ACTION_SEND, send.getAction());
        assertTrue((send.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0); assertNotNull(send.getClipData());
        Uri uri = send.getParcelableExtra(Intent.EXTRA_STREAM); assertEquals("content", uri.getScheme());
    }
    private LocationManager systemLocation(boolean precise) {
        Application application = (Application) activity.getApplication();
        Shadows.shadowOf(application).grantPermissions(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (precise) Shadows.shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        else Shadows.shadowOf(application).denyPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        LocationManager manager = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        Shadows.shadowOf(manager).setProviderEnabled(LocationManager.NETWORK_PROVIDER, true); return manager;
    }
    private Location fix(long ageMs) {
        Location fix = new Location(LocationManager.NETWORK_PROVIDER); fix.setLatitude(32.05); fix.setLongitude(118.78); fix.setAccuracy(1000);
        fix.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos() - ageMs * 1000000); fix.setTime(System.currentTimeMillis() - ageMs); return fix;
    }
    @Test public void approximateSystemLocationWorksWithoutGoogleServices() {
        LocationManager manager = systemLocation(false); Shadows.shadowOf(manager).setLastKnownLocation(LocationManager.NETWORK_PROVIDER, fix(0));
        JSObject args = new JSObject(); args.put("maximumAge", 300000);
        Call call = new Call("TurtleAndroidLocation", "getCurrentPosition", args); location().getCurrentPosition(call);
        assertNull(call.error); assertNotNull(call.result); assertEquals(32.05, call.result.getJSObject("coords").optDouble("latitude", 0.0), 0.001);
    }
    @Test public void staleLocationTimesOutAndUnregistersUpdates() {
        LocationManager manager = systemLocation(true); Shadows.shadowOf(manager).setLastKnownLocation(LocationManager.NETWORK_PROVIDER, fix(600000));
        JSObject args = new JSObject(); args.put("maximumAge", 300000); args.put("timeout", 1000);
        Call call = new Call("TurtleAndroidLocation", "getCurrentPosition", args); location().getCurrentPosition(call);
        assertNull(call.result); Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1001));
        assertNotNull(call.error); assertTrue(Shadows.shadowOf(manager).getLocationUpdateListeners().isEmpty());
    }
    @Test public void deniedLocationNeverStartsUpdates() {
        Application application = (Application) activity.getApplication();
        Shadows.shadowOf(application).denyPermissions(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION);
        Call call = new Call("TurtleAndroidLocation", "getCurrentPosition", new JSObject()); location().getCurrentPosition(call);
        assertEquals("LOCATION_DENIED", call.error); assertNull(call.result);
    }
    @Test public void leavingAppCancelsSingleLocationRequest() {
        LocationManager manager = systemLocation(false);
        Call call = new Call("TurtleAndroidLocation", "getCurrentPosition", new JSObject()); location().getCurrentPosition(call);
        assertNull(call.result); controller.pause(); assertNotNull(call.error);
        assertTrue(Shadows.shadowOf(manager).getLocationUpdateListeners().isEmpty());
    }
}
