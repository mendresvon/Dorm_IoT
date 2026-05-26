const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now // Automatically captures the exact time of the event
  },
  status: {
    type: String,
    required: true // e.g., "UNLOCKED", "ALARM_INTRUDER", or light commands
  },
  eventType: {
    type: String,
    required: true // e.g., "RFID Swipe", "App Button Click"
  },
  triggeredBy: {
    type: String,
    default: "System" // Stores the student's name, "Unknown Token", or "Mobile User"
  }
});

module.exports = mongoose.model('Activity', activitySchema, 'access_logs');
