package com.turtlekeeper.app;

import android.Manifest;
import android.app.NotificationManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.alibaba.sdk.android.push.CommonCallback;
import com.alibaba.sdk.android.push.CloudPushService;
import com.alibaba.sdk.android.push.noonesdk.PushServiceFactory;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@CapacitorPlugin(name = "TurtleAndroidPush", permissions = @Permission(
        strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "receive"))
public class TurtleAndroidPushPlugin extends Plugin {
    static final String PREFS = "turtle_push";
    static final String EXTRA = "turtle_push_notification";
    private static WeakReference<TurtleAndroidPushPlugin> active = new WeakReference<>(null);
    private volatile int generation = 0;

    @Override public void load() {
        active = new WeakReference<>(this);
        consumeIntent(getActivity().getIntent());
    }
    @Override protected void handleOnDestroy() {
        ++generation;
        if (active.get() == this) active.clear();
        super.handleOnDestroy();
    }
    @Override protected void handleOnNewIntent(Intent intent) { consumeIntent(intent); }
    private void consumeIntent(Intent intent) {
        if (intent == null) return;
        String raw = intent.getStringExtra(EXTRA);
        intent.removeExtra(EXTRA);
        if (raw == null || raw.length() > 8192) return;
        try {
            JSObject notification = new JSObject(raw);
            JSObject action = new JSObject().put("actionId", "tap").put("notification", notification);
            notifyListeners("pushNotificationActionPerformed", action, true);
        } catch (Exception ignored) { }
    }
    static void received(JSObject notification) {
        TurtleAndroidPushPlugin plugin = active.get();
        if (plugin != null) plugin.getActivity().runOnUiThread(() ->
                plugin.notifyListeners("pushNotificationReceived", notification));
    }
    static String recipientId(String phone) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(("community:" + phone).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b & 255));
            return hex.substring(0, 20);
        } catch (Exception e) { throw new IllegalStateException("Cannot hash recipient"); }
    }
    @Override @PluginMethod public void checkPermissions(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("consent", false)) {
            call.resolve(new JSObject().put("receive", prefs.getBoolean("consentAnswered", false) ? "denied" : "prompt"));
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("receive") != PermissionState.GRANTED) {
            super.checkPermissions(call);
            return;
        }
        boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= 26) {
            android.app.NotificationChannel channel = getContext().getSystemService(NotificationManager.class).getNotificationChannel(TurtleApplication.PUSH_CHANNEL);
            enabled = enabled && channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        call.resolve(new JSObject().put("receive", enabled ? "granted" : "denied"));
    }
    @Override @PluginMethod public void requestPermissions(PluginCall call) {
        if (!getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("consent", false)) {
            getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity())
                    .setTitle("开启消息与养护提醒")
                    .setMessage("我们使用阿里云移动推送发送私信、养护及温度提醒。开启后会向阿里云提供推送设备标识、应用及网络信息和通知内容。你可随时在系统设置中关闭通知。详见应用内《隐私政策》。")
                    .setPositiveButton("同意并继续", (dialog, which) -> {
                        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("consent", true).putBoolean("consentAnswered", true).commit();
                        requestSystemPermission(call);
                    }).setNegativeButton("暂不开启", (dialog, which) -> {
                        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("consentAnswered", true).commit();
                        call.resolve(new JSObject().put("receive", "denied"));
                    }).setCancelable(false).show());
            return;
        }
        requestSystemPermission(call);
    }
    private void requestSystemPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("receive") == PermissionState.GRANTED) checkPermissions(call);
        else requestPermissionForAlias("receive", call, "permissionResult");
    }
    @PermissionCallback private void permissionResult(PluginCall call) { checkPermissions(call); }
    @PluginMethod public void register(PluginCall call) {
        String phone = call.getString("phone", "");
        if (!phone.matches("1[3-9][0-9]{9}")) { call.reject("请先登录后开启通知"); return; }
        if (!getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("consent", false)) { call.reject("请先同意通知使用说明"); return; }
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) { call.reject("请在系统设置中允许通知"); return; }
        final int requestGeneration = ++generation;
        final String recipient = recipientId(phone);
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("recipient", recipient).apply();
        CloudPushService service = PushServiceFactory.getCloudPushService();
        service.register(getContext().getApplicationContext(), new CommonCallback() {
            @Override public void onSuccess(String unused) {
                if (generation != requestGeneration) { call.resolve(); return; }
                service.turnOnPushChannel(new CommonCallback() {
                    @Override public void onSuccess(String ignored) {
                        if (generation != requestGeneration) { call.resolve(); return; }
                        String deviceId = service.getDeviceId();
                        if (deviceId == null || deviceId.isEmpty()) { call.reject("通知设备注册失败"); return; }
                        notifyListeners("registration", new JSObject().put("value", deviceId).put("recipientId", recipient), true);
                        call.resolve(new JSObject().put("recipientId", recipient));
                    }
                    @Override public void onFailed(String code, String message) { failed(); }
                    private void failed() { call.reject("通知通道暂不可用，请稍后重试"); }
                });
            }
            @Override public void onFailed(String code, String message) {
                // Do not echo vendor errors that may contain SDK credentials.
                call.reject("通知设备注册失败，请检查网络后重试");
            }
        });
    }
    @PluginMethod public void unregister(PluginCall call) {
        ++generation;
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("recipient").commit();
        getContext().getSystemService(NotificationManager.class).cancelAll();
        PushServiceFactory.getCloudPushService().turnOffPushChannel(new CommonCallback() {
            @Override public void onSuccess(String unused) { }
            @Override public void onFailed(String code, String message) { }
        });
        // The local recipient guard is already cleared. A slow cloud request
        // must never keep the user logged in or block switching accounts.
        call.resolve();
    }
}
