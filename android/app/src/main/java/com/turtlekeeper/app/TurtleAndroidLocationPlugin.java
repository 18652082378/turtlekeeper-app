package com.turtlekeeper.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;
import java.util.List;

/** Foreground, single-fix system location. Works without Google Play Services. */
@CapacitorPlugin(name = "TurtleAndroidLocation", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
    @Permission(alias = "coarseLocation", strings = { Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class TurtleAndroidLocationPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager manager;
    private PluginCall pending;
    private LocationListener listener;
    private Runnable timeout;

    @PluginMethod public void getCurrentPosition(PluginCall call) {
        getActivity().runOnUiThread(() -> locate(call));
    }

    private void locate(PluginCall call) {
        if (pending != null) { call.reject("定位正在进行，请稍候", "LOCATION_BUSY"); return; }
        boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) { call.reject("LOCATION_DENIED", "LOCATION_DENIED"); return; }
        manager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        List<String> providers = new ArrayList<>();
        if (manager != null) for (String provider : manager.getProviders(true)) {
            if (provider.equals(LocationManager.NETWORK_PROVIDER) || provider.equals("fused")
                    || (fine && provider.equals(LocationManager.GPS_PROVIDER))) providers.add(provider);
        }
        if (providers.isEmpty()) { call.reject("请开启系统定位服务，或手动选择城市", "LOCATION_UNAVAILABLE"); return; }
        long maximumAge = Math.max(0, Math.min(300000, call.getInt("maximumAge", 0)));
        Location recent = null;
        for (String provider : providers) {
            try {
                Location candidate = manager.getLastKnownLocation(provider);
                if (fresh(candidate, maximumAge) && (recent == null || candidate.getElapsedRealtimeNanos() > recent.getElapsedRealtimeNanos())) recent = candidate;
            } catch (SecurityException ignored) { /* Permission may change while app is open. */ }
        }
        if (recent != null) { call.resolve(position(recent)); return; }
        pending = call;
        listener = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                if (!fresh(location, 30000) || pending == null) return;
                PluginCall result = pending; stop(); result.resolve(position(location));
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };
        timeout = () -> fail("定位超时，请移至开阔处重试，或手动选择城市", "LOCATION_TIMEOUT");
        handler.postDelayed(timeout, Math.max(1000, Math.min(30000, call.getInt("timeout", 10000))));
        int registered = 0;
        for (String provider : providers) {
            try { manager.requestLocationUpdates(provider, 0, 0, listener, Looper.getMainLooper()); registered++; }
            catch (SecurityException | IllegalArgumentException ignored) { }
        }
        if (registered == 0) fail("定位不可用，请检查权限或手动选择城市", "LOCATION_UNAVAILABLE");
    }

    static boolean fresh(Location location, long maximumAge) {
        if (location == null || maximumAge <= 0 || !Double.isFinite(location.getLatitude()) || !Double.isFinite(location.getLongitude())) return false;
        long age = SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos();
        return age >= 0 && age / 1000000 <= maximumAge;
    }

    private static JSObject position(Location location) {
        JSObject coords = new JSObject();
        coords.put("latitude", location.getLatitude()); coords.put("longitude", location.getLongitude());
        coords.put("accuracy", location.getAccuracy());
        JSObject result = new JSObject(); result.put("coords", coords); result.put("timestamp", location.getTime());
        return result;
    }

    private void stop() {
        if (timeout != null) handler.removeCallbacks(timeout);
        if (manager != null && listener != null) manager.removeUpdates(listener);
        pending = null; listener = null; timeout = null;
    }
    private void fail(String message, String code) {
        PluginCall call = pending; stop(); if (call != null) call.reject(message, code);
    }
    @Override protected void handleOnPause() { fail("定位已取消，请重试", "LOCATION_CANCELLED"); }
    @Override protected void handleOnDestroy() { stop(); }
}
