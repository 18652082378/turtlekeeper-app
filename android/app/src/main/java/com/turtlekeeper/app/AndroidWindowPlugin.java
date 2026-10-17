package com.turtlekeeper.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Match system-bar contrast to the app's chosen theme, not just the OS theme. */
@CapacitorPlugin(name = "TurtleAndroidWindow")
public class AndroidWindowPlugin extends Plugin {
    private boolean dark = false;
    private String backgroundColor = "#fbfaf7";
    private Boolean keyboardVisible = null;

    @PluginMethod
    public void hideKeyboard(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowCompat.getInsetsController(window, window.getDecorView())
                    .hide(androidx.core.view.WindowInsetsCompat.Type.ime());
            call.resolve();
        });
    }

    /** Local diagnostics only: no account data, network calls or settings changes. */
    @PluginMethod
    public void getDisplayMetrics(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            android.webkit.WebView webView = getBridge().getWebView();
            android.util.DisplayMetrics display = webView.getResources().getDisplayMetrics();
            JSObject result = new JSObject();
            result.put("textZoom", webView.getSettings().getTextZoom());
            result.put("initialTextZoom", ((MainActivity) getActivity()).getInitialWebTextZoom());
            result.put("fontScale", webView.getResources().getConfiguration().fontScale);
            result.put("density", display.density);
            result.put("widthPixels", webView.getWidth());
            result.put("heightPixels", webView.getHeight());
            call.resolve(result);
        });
    }

    public void updateKeyboardVisibility(boolean visible) {
        if (keyboardVisible != null && keyboardVisible == visible) return;
        keyboardVisible = visible;
        JSObject event = new JSObject();
        event.put("visible", visible);
        notifyListeners("keyboardVisibilityChange", event, true);
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        dark = call.getBoolean("dark", false);
        String requestedColor = call.getString("backgroundColor", "");
        backgroundColor = requestedColor != null && requestedColor.matches("#[0-9a-fA-F]{6}")
                ? requestedColor : (dark ? "#1c1c1e" : "#fbfaf7");
        getActivity().runOnUiThread(() -> { applyTheme(); call.resolve(); });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        getBridge().getWebView().post(this::applyTheme);
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration config) {
        super.handleOnConfigurationChanged(config);
        // Run after core SystemBars has processed orientation / night mode.
        getBridge().getWebView().post(this::applyTheme);
    }

    private void applyTheme() {
        Window window = getActivity().getWindow();
        View container = (View) getBridge().getWebView().getParent();
        applySystemBarStyle(window, container, dark, Color.parseColor(backgroundColor));
    }

    // Keep MainActivity's safe padding and keyboard handling. Only paint the
    // exposed native surface, so content never sits under the clock or buttons.
    static void applySystemBarStyle(Window window, View container, boolean dark, int background) {
        window.getDecorView().setBackgroundColor(background);
        container.setBackgroundColor(background);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
}
