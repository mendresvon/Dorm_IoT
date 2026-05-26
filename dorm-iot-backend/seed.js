require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./student');

const seedData = [
    {
        uid: '3A7F2B8C',
        name: '馬盛中',
        room: 'Dorm 403'
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
