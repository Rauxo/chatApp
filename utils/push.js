// const { Expo } = require('expo-server-sdk');

// let expo = new Expo();

// const sendPushNotification = async (somePushTokens, messageBody, data = {}) => {
//     let messages = [];
//     for (let pushToken of somePushTokens) {
//         if (!Expo.isExpoPushToken(pushToken)) {
//             console.error(`Push token ${pushToken} is not a valid Expo push token`);
//             continue;
//         }

//         messages.push({
//             to: pushToken,
//             sound: 'default',
//             body: messageBody,
//             data: data,
//         });
//     }

//     let chunks = expo.chunkPushNotifications(messages);
//     let tickets = [];
    
//     for (let chunk of chunks) {
//         try {
//             let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
//             tickets.push(...ticketChunk);
//         } catch (error) {
//             console.error('Error sending push notification chunk', error);
//         }
//     }
// };

// module.exports = { sendPushNotification };
const { Expo } = require('expo-server-sdk');

let expo = new Expo();

const sendPushNotification = async (somePushTokens, messageBody, data = {}, title = "New Message", badge = 0) => {
    try {
        let messages = [];

        for (let pushToken of somePushTokens) {
            // Check if it's a valid expo push token
            if (!Expo.isExpoPushToken(pushToken)) {
                console.error(`Push token ${pushToken} is not a valid Expo push token`);
                continue;
            }

            messages.push({
                to: pushToken,
                sound: 'default',
                title: title,
                body: messageBody,
                data: data,
                badge: badge,
                // iOS: Use threadId for grouping
                threadId: data.senderId || 'default',
                // Android: Usually handled by channel or tag
            });
        }

        if (messages.length === 0) return;

        let chunks = expo.chunkPushNotifications(messages);
        let tickets = [];

        for (let chunk of chunks) {
            try {
                let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('Error sending push notification chunk', error);
            }
        }
    } catch (error) {
        // We log the error but don't rethrow it so a push notification failure doesn't 
        // cause the entire 'send message' API call to return a 500 status code.
        console.error('Push notification overall failed:', error);
    }
};

module.exports = { sendPushNotification };