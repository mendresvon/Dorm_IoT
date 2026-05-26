const mqtt = require('mqtt');

const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const TOPIC = 'home/door/rfid';
const SCANNED_UID = '366DCB06'; // Roommate B's card UID

console.log(`📡 Connecting to ${MQTT_BROKER}...`);
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
    console.log(`✅ Connected! Publishing RFID swipe for Roommate B (UID: "${SCANNED_UID}") to topic: "${TOPIC}"...`);
    client.publish(TOPIC, SCANNED_UID, { qos: 1 }, (err) => {
        if (err) {
            console.error('❌ Failed to publish message:', err);
        } else {
            console.log('🎉 Roommate B RFID swipe published successfully!');
        }
        client.end();
    });
});
