package com.turtlekeeper.app;

import static org.junit.Assert.*;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import android.os.Looper;
import android.webkit.WebView;
import org.junit.Test;
import org.junit.Before;
import android.content.pm.PackageInfo;
import org.robolectric.shadows.ShadowWebView;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import com.getcapacitor.CapConfig;

/** Tests the native activity lifecycle, not the desktop CSS viewport mock.
 * Robolectric does not certify Samsung WebView painting or real fold hardware.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class AndroidTypographyTest {
    @Before public void provideWebViewPackageMetadata() {
        PackageInfo provider = new PackageInfo();
        provider.packageName = "com.android.webview";
        provider.versionName = "130.0.0.0";
        ShadowWebView.setCurrentWebViewPackage(provider);
    }
    public static class TestActivity extends MainActivity {
        @Override protected void load() {
            // Robolectric has no Chromium ServiceWorker provider. This test-only
            // switch bypasses that unrelated API; production config is unchanged.
            config = new CapConfig.Builder(this).setResolveServiceWorkerRequests(false).create();
            super.load();
            getBridge().getWebView().getSettings().setTextZoom(150);
        }
    }
    @Test public void startupUsesCssTextScale() {
        try (ActivityController<TestActivity> controller = Robolectric.buildActivity(TestActivity.class).setup()) {
            assertEquals(100, controller.get().getBridge().getWebView().getSettings().getTextZoom());
            assertEquals(150, controller.get().getInitialWebTextZoom());
        }
    }

    @Test public void viewportNeverStretchesNavigationDuringEdgePull() {
        try (ActivityController<TestActivity> controller = Robolectric.buildActivity(TestActivity.class).setup()) {
            MainActivity activity = controller.get();
            WebView web = activity.getBridge().getWebView();
            assertEquals(View.OVER_SCROLL_NEVER, web.getOverScrollMode());
            controller.pause();
            web.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
            controller.resume();
            assertEquals(View.OVER_SCROLL_NEVER, web.getOverScrollMode());
            web.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
            Configuration config = new Configuration(activity.getResources().getConfiguration());
            config.screenWidthDp = 720;
            activity.onConfigurationChanged(config);
            Shadows.shadowOf(Looper.getMainLooper()).idle();
            assertEquals(View.OVER_SCROLL_NEVER, web.getOverScrollMode());
            assertSame(web, activity.getBridge().getWebView());
        }
    }

    @Test public void systemBarsMatchSurfaceWithoutRemovingSafeInsets() {
        try (ActivityController<TestActivity> controller = Robolectric.buildActivity(TestActivity.class).setup()) {
            MainActivity activity = controller.get();
            Window window = activity.getWindow();
            View container = (View) activity.getBridge().getWebView().getParent();
            container.setPadding(8, 24, 8, 48);
            window.setStatusBarContrastEnforced(true);
            window.setNavigationBarContrastEnforced(true);
            for (boolean dark : new boolean[] { false, true, false }) {
                int color = Color.parseColor(dark ? "#1c1c1e" : "#fbfaf7");
                AndroidWindowPlugin.applySystemBarStyle(window, container, dark, color);
                assertFalse(window.isStatusBarContrastEnforced());
                assertFalse(window.isNavigationBarContrastEnforced());
                assertEquals(Color.TRANSPARENT, window.getStatusBarColor());
                assertEquals(Color.TRANSPARENT, window.getNavigationBarColor());
                assertEquals(color, ((ColorDrawable) container.getBackground()).getColor());
                assertEquals(!dark, WindowCompat.getInsetsController(window, window.getDecorView()).isAppearanceLightStatusBars());
                assertEquals(!dark, WindowCompat.getInsetsController(window, window.getDecorView()).isAppearanceLightNavigationBars());
                assertEquals(24, container.getPaddingTop());
                assertEquals(48, container.getPaddingBottom());
                assertEquals(8, container.getPaddingLeft());
            }
        }
    }

    @Test public void resumeRemovesExtraTextScaleAndMinimumFontOverride() {
        try (ActivityController<TestActivity> controller = Robolectric.buildActivity(TestActivity.class).setup()) {
            WebView web = controller.get().getBridge().getWebView();
            controller.pause();
            web.getSettings().setTextZoom(150);
            web.getSettings().setMinimumFontSize(24);
            web.getSettings().setMinimumLogicalFontSize(24);
            controller.resume();
            assertEquals(100, web.getSettings().getTextZoom());
            assertEquals(1, web.getSettings().getMinimumFontSize());
            assertEquals(1, web.getSettings().getMinimumLogicalFontSize());
            assertSame(web, controller.get().getBridge().getWebView());
        }
    }

    @Test public void foldingReappliesScaleWithoutReplacingWebView() {
        try (ActivityController<TestActivity> controller = Robolectric.buildActivity(TestActivity.class).setup()) {
            MainActivity activity = controller.get();
            WebView web = activity.getBridge().getWebView();
            for (int width : new int[] { 320, 720, 1100, 320 }) {
                web.getSettings().setTextZoom(150);
                Configuration config = new Configuration(activity.getResources().getConfiguration());
                config.screenWidthDp = width;
                config.fontScale = 1.5f;
                activity.onConfigurationChanged(config);
                Shadows.shadowOf(Looper.getMainLooper()).idle();
                assertEquals(100, web.getSettings().getTextZoom());
                assertSame(web, activity.getBridge().getWebView());
            }
        }
    }
}
