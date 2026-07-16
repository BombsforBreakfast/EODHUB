package com.eodhub.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String PUSH_CHANNEL_ID = "eod_hub_alerts";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createPushNotificationChannel();
    }

    private void createPushNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            PUSH_CHANNEL_ID,
            "EOD-Hub alerts",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Messages and activity from EOD-Hub");
        channel.setShowBadge(true);

        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.eod_click);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        channel.setSound(soundUri, audioAttributes);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
