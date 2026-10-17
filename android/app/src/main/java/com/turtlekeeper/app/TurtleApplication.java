package com.turtlekeeper.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import com.alibaba.sdk.android.push.CloudPushService;
import com.alibaba.sdk.android.push.noonesdk.PushInitConfig;
import com.alibaba.sdk.android.push.noonesdk.PushServiceFactory;

public class TurtleApplication extends Application {
    static final String PUSH_CHANNEL = "turtle_updates";
    @Override public void onCreate() {
        super.onCreate();
        // Parameter initialization only. Registration waits for signed-in consent
        // and runtime notification permission in TurtleAndroidPushPlugin.
        PushServiceFactory.init(new PushInitConfig.Builder().application(this)
                .appKey(BuildConfig.PUSH_APP_KEY).appSecret(BuildConfig.PUSH_APP_SECRET).build());
        PushServiceFactory.getCloudPushService().setLogLevel(CloudPushService.LOG_OFF);
        PushServiceFactory.getCloudPushService().setDebug(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(PUSH_CHANNEL,
                    "消息与养护提醒", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("私信、养护及温度提醒");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
}
