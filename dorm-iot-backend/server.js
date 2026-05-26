require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ----------------------------------------------------
// 1. MOCK DATA BASELINE (Week 4 will migrate this to MongoDB)
// ----------------------------------------------------
const allowedUsers = {
    "3A7F2B8C": { name: "馬盛中", room: "Dorm 403" } // Replace with your actual 4-byte HEX UID from Serial Monitor!
};

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

function sendNotificationEmail(studentName, roomNumber) {
    const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.PARENT_EMAIL,
        subject: `🚨 [平安回宿通知] ${studentName} 已安全抵達宿舍`,
        text: `您好：\n\n您的孩子 ${studentName} 已於 ${currentTime} 順利刷卡返回宿舍 (${roomNumber})。\n\n此訊息由 RFID 智慧宿舍生活系統自動發送。`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('❌ Email dispatch failed:', error);
        } else {
            console.log('📧 Notification Email sent successfully:', info.response);
        }
    });
}

// ----------------------------------------------------
// 3. MQTT BROKER CONNECTION & TOPIC SUBSCRIPTION
// ----------------------------------------------------
const mqttClient = mqtt.connect(process.env.MQTT_BROKER);

mqttClient.on('connect', () => {
    console.log('📡 Connected to HiveMQ Cloud Broker successfully!');
    // Subscribe to the door swipe event topic
    mqttClient.subscribe('home/door/rfid', { qos: 1 }, (err) => {
        if (!err) console.log('📥 Subscribed to topic: home/door/rfid');
    });
});

mqttClient.on('message', (topic, message) => {
    if (topic === 'home/door/rfid') {
        const scannedUID = message.toString().trim().toUpperCase();
        console.log(`🔑 Card Swiped! Detected UID: ${scannedUID}`);

        // Process UID verification
        if (allowedUsers[scannedUID]) {
            const student = allowedUsers[scannedUID];
            console.log(`✅ Access Granted: User verified as ${student.name}`);
            
            // Execute automated parent alert trigger
            sendNotificationEmail(student.name, student.room);
        } else {
            console.log(`❌ Access Denied: Unknown UID ${scannedUID}`);
        }
    }
});

// ----------------------------------------------------
// 4. HTTP ENDPOINTS (For MIT App Inventor UI later on)
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.send('🚀 Smart RFID Dormitory Backend is up and running!');
});

// HTTP endpoint for manual/voice lighting overrides
app.post('/api/lights', (req, res) => {
    const { scene, brightness } = req.body;
    console.log(`📱 App Command Received -> Scene: ${scene}, Brightness: ${brightness}`);
    
    const payload = JSON.stringify({ scene, brightness });
    mqttClient.publish('home/room/lights/set', payload, { qos: 1 });
    
    res.status(200).json({ status: "success", message: "Command pushed to MQTT" });
});

// Start listening for traffic
app.listen(PORT, () => {
    console.log(`⚡ Server running locally on http://localhost:${PORT}`);
});