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
const mqttClient = mqtt.connect(process.env.MQTT_BROKER);

mqttClient.on('connect', () => {
    console.log('📡 Connected to HiveMQ Cloud Broker successfully!');
    mqttClient.subscribe('home/door/rfid', { qos: 1 });
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
            } else {
                console.log(`❌ Access Denied: Unknown UID ${scannedUID}`);
                
                // Log intruder alert
                await Activity.create({
                    status: "ALARM_INTRUDER",
                    eventType: "RFID Swipe",
                    triggeredBy: `Unknown Token (${scannedUID})`
                });
            }
        } catch (err) {
            console.error('❌ Database logging error:', err);
        }
    }
});

// ----------------------------------------------------
// 4. HTTP ENDPOINTS
// ----------------------------------------------------
app.post('/api/lights', async (req, res) => {
    const { scene, brightness, triggerSource, spokenText } = req.body;
    console.log(`📱 App Command Received -> Scene: ${scene}, Brightness: ${brightness}`);
    
    try {
        mqttClient.publish('home/room/lights/set', JSON.stringify({ scene, brightness }), { qos: 1 });
        
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