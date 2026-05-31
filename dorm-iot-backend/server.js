require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const Student = require('./student'); // Import our new database schema
const Activity = require('./activity'); // Import our activity logs schema

const app = express();
app.use(express.json());
app.use(express.static('public'));
const PORT = process.env.PORT || 8080;

// SSE client registry — keeps track of all door page connections
let sseClients = [];
let lastDoorEvent = null;  // Cached for new clients that connect after a swipe

// ----------------------------------------------------
// 1. DATABASE CONNECTIVITY (Replaces hardcoded object)
// ----------------------------------------------------
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🍃 Connected to MongoDB Atlas Cluster successfully!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ----------------------------------------------------
// 2. NODEMAILER EMAIL CONFIGURATION
// ----------------------------------------------------
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendNotificationEmail(studentName, roomNumber, parentEmail) {
    const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: parentEmail,
        subject: `🚨 [平安回宿通知] ${studentName} 已安全抵達宿舍`,
        text: `您好：\n\n您的孩子 ${studentName} 已於 ${currentTime} 順利刷卡返回宿舍 (${roomNumber})。\n\n此訊息由 RFID 智慧宿舍生活系統自動發送。`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.error('❌ Email dispatch failed:', error);
        else console.log('📧 Notification Email sent successfully:', info.response);
    });
}

// ----------------------------------------------------
// 3. MQTT BROKER CONNECTION & LIVE DB LOOKUP
// ----------------------------------------------------
console.log(`🔌 Initializing MQTT connection to: ${process.env.MQTT_BROKER || 'undefined (defaulting to localhost)'}`);
const mqttClient = mqtt.connect(process.env.MQTT_BROKER);

mqttClient.on('connect', () => {
    console.log('📡 Connected to HiveMQ Cloud Broker successfully!');
    mqttClient.subscribe('home/door/rfid', { qos: 1 });
});

mqttClient.on('error', (err) => {
    console.error('❌ MQTT Client Error:', err.message || err);
});

mqttClient.on('offline', () => {
    console.warn('⚠️ MQTT Client went offline.');
});

mqttClient.on('close', () => {
    console.log('🔌 MQTT connection closed.');
});

mqttClient.on('reconnect', () => {
    console.log('🔄 MQTT Client attempting to reconnect...');
});

mqttClient.on('message', async (topic, message, packet) => {
    // Ignore historical retained messages delivered immediately on connection
    if (packet && packet.retain) {
        console.log(`ℹ️ Ignoring historical retained MQTT packet on [${topic}]`);
        return;
    }

    if (topic === 'home/door/rfid') {
        const scannedUID = message.toString().trim().toUpperCase();
        console.log(`🔑 Card Swiped! Detected UID: ${scannedUID}`);

        try {
            // Live asynchronous database lookup matching the swiped card's UID
            const student = await Student.findOne({ uid: scannedUID });

            if (student) {
                console.log(`✅ Access Granted: User verified as ${student.name}`);
                sendNotificationEmail(student.name, student.room, student.parentEmail);
                
                // Log successful access
                await Activity.create({
                    status: "UNLOCKED",
                    eventType: "RFID Swipe",
                    triggeredBy: student.name
                });

                // Push real-time event to all Virtual Door SSE clients
                broadcastDoorEvent({ type: 'UNLOCKED', name: student.name, uid: scannedUID, room: student.room, timestamp: new Date().toISOString() });
            } else {
                console.log(`❌ Access Denied: Unknown UID ${scannedUID}`);
                
                // Log intruder alert
                await Activity.create({
                    status: "ALARM_INTRUDER",
                    eventType: "RFID Swipe",
                    triggeredBy: `Unknown Token (${scannedUID})`
                });

                // Push denial event to all Virtual Door SSE clients
                broadcastDoorEvent({ type: 'DENIED', name: 'Unknown', uid: scannedUID, room: null, timestamp: new Date().toISOString() });
            }
        } catch (err) {
            console.error('❌ Database logging error:', err);
        }
    }
});

// ----------------------------------------------------
// 4. SSE HELPER — Broadcasts door events to all connected clients
// ----------------------------------------------------
function broadcastDoorEvent(payload) {
    lastDoorEvent = payload;  // Cache so new clients get current state immediately
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach(res => {
        try { res.write(data); } catch (e) { /* stale client — will be cleaned up on close */ }
    });
    console.log(`📡 SSE broadcast → ${payload.type} for ${payload.name} (${payload.uid}), clients: ${sseClients.length}`);
}

// ----------------------------------------------------
// 5. HTTP ENDPOINTS
// ----------------------------------------------------

// Server-Sent Events endpoint for the Virtual Door page
app.get('/api/door-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering on Cloud Run
    res.flushHeaders();

    // Confirm connection
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    // Replay last known door state so the page is never blank on open
    if (lastDoorEvent) {
        res.write(`data: ${JSON.stringify({ ...lastDoorEvent, replayed: true })}\n\n`);
    }

    sseClients.push(res);
    console.log(`🔌 Virtual Door client connected. Total: ${sseClients.length}`);

    // Keepalive ping every 20s — prevents Cloud Run from killing idle SSE connections
    const keepAlive = setInterval(() => {
        try {
            res.write(': ping\n\n');  // SSE comment — ignored by client, keeps TCP alive
        } catch (e) {
            clearInterval(keepAlive);
        }
    }, 20000);

    // Clean up on disconnect
    req.on('close', () => {
        clearInterval(keepAlive);
        sseClients = sseClients.filter(c => c !== res);
        console.log(`🔌 Virtual Door client disconnected. Total: ${sseClients.length}`);
    });
});

// REST fallback — lets door.html poll if SSE is unavailable
app.get('/api/door-status', (req, res) => {
    res.json(lastDoorEvent || { type: 'LOCKED', timestamp: new Date().toISOString() });
});

// Expose the MQTT connection status
app.get('/api/mqtt-status', (req, res) => {
    res.json({ connected: mqttClient.connected });
});

// Trigger and await MQTT reconnection
app.post('/api/mqtt-reconnect', (req, res) => {
    if (mqttClient.connected) {
        return res.json({ connected: true, message: 'Already connected' });
    }

    const onConnect = () => {
        cleanup();
        res.json({ connected: true, message: 'Reconnected successfully' });
    };

    const onError = (err) => {
        cleanup();
        res.status(500).json({ connected: false, message: err.message });
    };

    const timeout = setTimeout(() => {
        cleanup();
        res.status(504).json({ connected: false, message: 'Reconnection timed out' });
    }, 8000);

    function cleanup() {
        mqttClient.off('connect', onConnect);
        mqttClient.off('error', onError);
        clearTimeout(timeout);
    }

    mqttClient.once('connect', onConnect);
    mqttClient.once('error', onError);

    mqttClient.reconnect();
});

// Dynamic student presets endpoint for the virtual door simulator
app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find({}, 'name uid room');
        res.json(students);
    } catch (err) {
        console.error('❌ Error fetching students:', err);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// Simulate scan endpoint — lets the door page trigger a test scan without needing the ESP32
app.post('/api/simulate-scan', async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid is required' });

    const scannedUID = uid.trim().toUpperCase();
    console.log(`🧪 Simulated scan: UID ${scannedUID}`);

    try {
        const student = await Student.findOne({ uid: scannedUID });
        if (student) {
            await Activity.create({ status: 'UNLOCKED', eventType: 'Simulated Scan', triggeredBy: student.name });
            broadcastDoorEvent({ type: 'UNLOCKED', name: student.name, uid: scannedUID, room: student.room, timestamp: new Date().toISOString() });
            res.json({ result: 'UNLOCKED', name: student.name });
        } else {
            await Activity.create({ status: 'ALARM_INTRUDER', eventType: 'Simulated Scan', triggeredBy: `Unknown Token (${scannedUID})` });
            broadcastDoorEvent({ type: 'DENIED', name: 'Unknown', uid: scannedUID, room: null, timestamp: new Date().toISOString() });
            res.json({ result: 'DENIED', uid: scannedUID });
        }
    } catch (err) {
        console.error('❌ Simulate scan error:', err);
        res.status(500).json({ error: 'Simulation failed' });
    }
});

// ----------------------------------------------------
// (continued)
app.post('/api/lights', async (req, res) => {
    const { scene, brightness, triggerSource, spokenText, color, effect, speed } = req.body;
    console.log(`📱 App Command Received -> Scene: ${scene}, Brightness: ${brightness}, Color: ${color || 'N/A'}, Effect: ${effect || 'N/A'}`);
    
    // Build the MQTT payload with all available fields for ESP32
    const mqttPayload = { scene, brightness };
    if (color) mqttPayload.color = color;
    if (effect) mqttPayload.effect = effect;
    if (speed) mqttPayload.speed = speed;
    
    try {
        mqttClient.publish('home/room/lights/set', JSON.stringify(mqttPayload), { qos: 1 });
        
        // Record the app interaction to MongoDB dynamically (Button vs Voice Command)
        const eventType = triggerSource || "App Button Click";
        const triggeredBy = spokenText ? `Spoken: "${spokenText}"` : "Mobile User";
        
        await Activity.create({
            status: `Scene: ${scene}, Brightness: ${brightness}`,
            eventType: eventType,
            triggeredBy: triggeredBy
        });
        
        res.status(200).json({ status: "success", message: "Command pushed to MQTT and logged" });
    } catch (err) {
        console.error('❌ Failed to log light command:', err);
        res.status(500).json({ error: "Failed to log action" });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        // Fetch the 20 most recent events, sorted newest first
        const logs = await Activity.find().sort({ timestamp: -1 }).limit(20);
        res.status(200).json(logs);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch access logs" });
    }
});

app.listen(PORT, () => {
    console.log(`⚡ Server running locally on http://localhost:${PORT}`);
});