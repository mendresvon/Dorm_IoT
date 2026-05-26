const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    uid: { 
        type: String, 
        required: true, 
        unique: true, 
        uppercase: true, 
        trim: true 
    },
    name: { 
        type: String, 
        required: true 
    },
    room: { 
        type: String, 
        required: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
