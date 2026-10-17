package com.turtlekeeper.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.res.Configuration;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    private Integer initialWebTextZoom = null;

    int getInitialWebTextZoom() {
        return initialWebTextZoom == null ? 100 : initialWebTextZoom;
    }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidWindowPlugin.class);
        registerPlugin(AlipayTeamPlugin.class);
        registerPlugin(TurtleAndroidPushPlugin.class);
        registerPlugin(TurtleAndroidFilesPlugin.class);
        registerPlugin(TurtleAndroidLocationPlugin.class);
        super.onCreate(savedInstanceState);
        applyWebTypography();
        applyWebScrollPolicy();
        // Keep the entire WebView in the usable window, including foldable
        // taskbars, cutouts and the IME. One owner prevents double CSS insets.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View container = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            AndroidWindowPlugin windowPlugin = (AndroidWindowPlugin) getBridge()
                    .getPlugin("TurtleAndroidWindow").getInstance();
            windowPlugin.updateKeyboardVisibility(insets.isVisible(WindowInsetsCompat.Type.ime()));
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
                            | WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .build();
        });
        ViewCompat.requestApplyInsets(container);
    }

    /** CSS owns the designed text sizes, as it does in the iOS bundle.
     * WebView textZoom is independent of CSS text-size-adjust and page zoom.
     * Do not compound those sizes with an inherited/OEM WebView text multiplier.
     */
    void applyWebTypography() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        if (initialWebTextZoom == null) initialWebTextZoom = settings.getTextZoom();
        settings.setTextZoom(100);
        settings.setMinimumFontSize(1);
        settings.setMinimumLogicalFontSize(1);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
    }

    void applyWebScrollPolicy() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        // Android 12+ stretches the entire WebView at a scroll boundary,
        // including CSS-fixed headers and tabs. Keep that viewport stationary;
        // scrolling, fling and the app's touch-based refresh remain enabled.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWebTypography();
        applyWebScrollPolicy();
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyWebTypography();
        applyWebScrollPolicy();
        // The WebView also processes density / font / folding configuration.
        // Reapply after its queued configuration callback, without reloading it.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                applyWebTypography();
                applyWebScrollPolicy();
            });
        }
    }
}
