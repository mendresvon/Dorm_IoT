require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./student');

const seedData = [
    {
        uid: '0475539A327680',
        name: '馬盛中',
        room: 'Dorm 403',
        parentEmail: 'mendresvon2@gmail.com'
    },
    {
        uid: '366DCB06',
        name: 'Roommate B',
        room: 'Dorm 403',
        parentEmail: '4b1yz001@stust.edu.tw'
    }
];

async function seedDatabase() {
    try {
        console.log('🍃 Connecting to MongoDB Atlas for seeding...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected successfully!');

        // Delete existing data to start fresh and avoid unique key constraints
        console.log('🗑️ Cleaning up existing students in database...');
        await Student.deleteMany({});
        
        // Insert new records
        console.log('📝 Inserting student records...');
        const result = await Student.insertMany(seedData);
        console.log('🎉 Database seeded successfully! Inserted records:');
        console.log(result);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        // Ensure connection is closed cleanly
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }
}

seedDatabase();
