let Expo;

async function getExpo() {
  if (!Expo) {
    const module = await import('expo-server-sdk');
    Expo = module.Expo;
  }
  return Expo;
}

const sendPushNotification = async (
  somePushTokens,
  messageBody,
  data = {},
  title = "New Message",
  badge = 0
) => {
  try {
    const ExpoClass = await getExpo();   // ✅ load dynamically
    const expo = new ExpoClass();        // ✅ create instance

    let messages = [];

    for (let pushToken of somePushTokens) {
      // ✅ use ExpoClass here (not Expo)
      if (!ExpoClass.isExpoPushToken(pushToken)) {
        console.error(`Invalid push token: ${pushToken}`);
        continue;
      }

      messages.push({
        to: pushToken,
        sound: "default",
        title: title,
        body: messageBody,
        data: data,
        badge: badge,
        threadId: data.senderId || "default",
      });
    }

    if (messages.length === 0) return;

    // ✅ chunking
    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];

    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("Chunk send error:", error);
      }
    }

  } catch (error) {
    console.error("Push notification failed:", error);
  }
};

module.exports = { sendPushNotification };