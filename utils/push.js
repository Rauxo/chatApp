const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');

if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.warn("Firebase service account missing: expected at backend/firebase-service-account.json. Push notifications will fail if default credentials aren't set.");
    try {
        admin.initializeApp(); // Attempt fallback to application default credentials
    } catch (e) {
        console.warn("Default firebase-admin app init failed.");
    }
}

const sendPushNotification = async (
  somePushTokens,
  messageBody,
  data = {},
  title = "New Message",
  badge = 0,
  tag = null
) => {
  try {
    let messageTokens = somePushTokens.filter(token => typeof token === 'string' && token.length > 0);
    if (messageTokens.length === 0) return;
    
    // Ensure all data payload values are strings as required by Firebase FCM
    const stringifiedData = {};
    for (const key in data) {
      if (data[key] !== null && data[key] !== undefined) {
        stringifiedData[key] = String(data[key]);
      }
    }
    
    const message = {
        tokens: messageTokens,
        notification: {
            title: title,
            body: messageBody,
        },
        data: {
            ...stringifiedData,
            badge: String(badge) // Also include badge as string in data payload
        },
        android: {
            notification: {
                sound: 'default',
                notificationCount: badge,
                ...(tag && { tag: tag })
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: badge,
                    ...(tag && { 'thread-id': tag })
                }
            }
        }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    response.responses.forEach((resp, idx) => {
        if (!resp.success) {
            console.error(`Failed to send FCM push to token ${messageTokens[idx]}:`, resp.error);
        }
    });

  } catch (error) {
    console.error("Firebase push notification failed:", error);
  }
};

module.exports = { sendPushNotification };