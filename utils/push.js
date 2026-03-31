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
let expo;

const sendPushNotification = async (somePushTokens, messageBody, data = {}) => {
    // 🔥 Dynamic import (fix for ESM)
    if (!expo) {
        const { Expo } = await import('expo-server-sdk');
        expo = new Expo();
    }

    let messages = [];

    for (let pushToken of somePushTokens) {
        if (!expo.constructor.isExpoPushToken(pushToken)) {
            console.error(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
        }

        messages.push({
            to: pushToken,
            sound: 'default',
            body: messageBody,
            data: data,
        });
    }

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
};

module.exports = { sendPushNotification };