const mqtt = require('mqtt');

const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const TOPIC = 'home/room/lights/set';

console.log(`📡 Connecting to ${MQTT_BROKER}...`);
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
    console.log(`✅ Connected! Subscribing to topic: "${TOPIC}"...`);
    client.subscribe(TOPIC, { qos: 1 }, (err) => {
        if (!err) {
            console.log('📥 Subscribed! Waiting for messages. Make a POST request to your API to trigger this...');
        }
    });
});

client.on('message', (topic, message) => {
    console.log(`💡 Received message on [${topic}]:`, message.toString());
});
