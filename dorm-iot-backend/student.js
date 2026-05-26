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
        required: true,
        trim: true
    },
    room: { 
        type: String, 
        required: true,
        trim: true
    },
    parentEmail: { 
        type: String, 
        required: true,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
