/**
 * EOD-Hub native push notification sound identifiers.
 *
 * iOS APNs expects the bundled filename including extension.
 * Android FCM/res/raw uses the basename without extension.
 */
export const PUSH_NOTIFICATION_SOUND_FILE = "eod_click.wav";
export const IOS_PUSH_NOTIFICATION_SOUND = PUSH_NOTIFICATION_SOUND_FILE;
export const ANDROID_PUSH_NOTIFICATION_SOUND = "eod_click";
export const ANDROID_NOTIFICATION_CHANNEL_ID = "eod_hub_alerts";
export const APNS_SOUND_FALLBACK = "default";
