package com.turtlekeeper.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.alibaba.sdk.android.push.MessageReceiver;
import com.alibaba.sdk.android.push.notification.CPushMessage;
import com.getcapacitor.JSObject;
import java.util.Map;

public class TurtlePushReceiver extends MessageReceiver {
    // Own the notification so a logged-out or changed account cannot see a
    // private message queued for the previous account on the same phone.
    @Override public boolean showNotificationNow(Context context, Map<String, String> map) { return false; }
    static boolean accepts(Context context, Map<String, String> data) {
        String recipient = context.getSharedPreferences(TurtleAndroidPushPlugin.PREFS, Context.MODE_PRIVATE).getString("recipient", "");
        return !recipient.isEmpty() && data != null && recipient.equals(data.get("recipientId"));
    }
    static void deliver(Context context, String title, String body, Map<String, String> data) {
        if (!accepts(context, data) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        JSObject extra = new JSObject();
        for (Map.Entry<String, String> item : data.entrySet()) extra.put(item.getKey(), item.getValue());
        String id = data.get("_ALIYUN_NOTIFICATION_MSG_ID_");
        if (id == null) id = extra.toString() + title + body;
        int notificationId = id.hashCode() & 0x7fffffff;
        JSObject notification = new JSObject().put("id", id).put("title", title).put("body", body).put("data", extra);
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra(TurtleAndroidPushPlugin.EXTRA, notification.toString());
        PendingIntent intent = PendingIntent.getActivity(context, notificationId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification banner = new NotificationCompat.Builder(context, TurtleApplication.PUSH_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(intent)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true).build();
        try { NotificationManagerCompat.from(context).notify(notificationId, banner); }
        catch (SecurityException ignored) { return; }
        TurtleAndroidPushPlugin.received(notification);
    }
    @Override protected void onNotificationReceivedInApp(Context context, String title, String summary,
            Map<String, String> data, int openType, String activity, String url) { deliver(context, title, summary, data); }
    @Override protected void onNotification(Context context, String title, String summary, Map<String, String> data) { }
    @Override protected void onMessage(Context context, CPushMessage message) { }
    @Override protected void onNotificationOpened(Context context, String title, String summary, String data) { }
    @Override protected void onNotificationClickedWithNoAction(Context context, String title, String summary, String data) { }
    @Override protected void onNotificationRemoved(Context context, String id) { }
}
