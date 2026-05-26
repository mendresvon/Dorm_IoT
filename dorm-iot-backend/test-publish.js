const mqtt = require('mqtt');

const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const TOPIC = 'home/door/rfid';
const SCANNED_UID = '3A7F2B8C';

console.log(`📡 Connecting to ${MQTT_BROKER}...`);
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
    console.log(`✅ Connected! Publishing RFID swipe for UID: "${SCANNED_UID}" to topic: "${TOPIC}"...`);
    client.publish(TOPIC, SCANNED_UID, { qos: 1 }, (err) => {
        if (err) {
            console.error('❌ Failed to publish message:', err);
        } else {
            console.log('🎉 RFID swipe published successfully!');
        }
        client.end();
    });
});
