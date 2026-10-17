package com.turtlekeeper.app;

import static org.junit.Assert.*;
import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import androidx.core.app.NotificationManagerCompat;
import java.util.HashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.Shadows;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class)
public class TurtlePushReceiverTest {
    private Context context;
    private NotificationManager manager;
    private Map<String, String> data;
    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(TurtleApplication.PUSH_CHANNEL, "测试", 3));
        context.getSharedPreferences(TurtleAndroidPushPlugin.PREFS, 0).edit().clear()
                .putString("recipient", TurtleAndroidPushPlugin.recipientId("13900000001")).commit();
        data = new HashMap<>();
        data.put("recipientId", TurtleAndroidPushPlugin.recipientId("13900000001"));
        data.put("route", "weather");
        data.put("_ALIYUN_NOTIFICATION_MSG_ID_", "message-001");
    }
    @Test public void tapRetainsColdStartRoutingAndUsesTheRegisteredChannel() throws Exception {
        TurtlePushReceiver.deliver(context, "低温提醒", "明天最低10℃", data);
        assertEquals(1, manager.getActiveNotifications().length);
        android.app.Notification notification = manager.getActiveNotifications()[0].getNotification();
        assertEquals(TurtleApplication.PUSH_CHANNEL, notification.getChannelId());
        android.content.Intent intent = Shadows.shadowOf(notification.contentIntent).getSavedIntent();
        com.getcapacitor.JSObject payload = new com.getcapacitor.JSObject(intent.getStringExtra(TurtleAndroidPushPlugin.EXTRA));
        assertEquals("weather", payload.getJSONObject("data").getString("route"));
        assertEquals(TurtleAndroidPushPlugin.recipientId("13900000001"), payload.getJSONObject("data").getString("recipientId"));
        // Retrying the same SDK callback updates the existing banner.
        TurtlePushReceiver.deliver(context, "低温提醒", "明天最低10℃", data);
        assertEquals(1, manager.getActiveNotifications().length);
    }
    @Test public void logoutOrSwitchNeverDisplaysPreviousAccountsNotification() {
        data.put("recipientId", TurtleAndroidPushPlugin.recipientId("13900000002"));
        TurtlePushReceiver.deliver(context, "私人消息", "不应显示", data);
        assertEquals(0, manager.getActiveNotifications().length);
        context.getSharedPreferences(TurtleAndroidPushPlugin.PREFS, 0).edit().clear().commit();
        data.put("recipientId", TurtleAndroidPushPlugin.recipientId("13900000001"));
        TurtlePushReceiver.deliver(context, "私人消息", "不应显示", data);
        assertEquals(0, manager.getActiveNotifications().length);
    }
}
