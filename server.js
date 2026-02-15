const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
require('./utils/redis'); // Connect to Redis
const Song = require('./models/Song');
const redisClient = require('./utils/redis');

// Seed Redis with Song Titles for Autocomplete
const seedRedis = async () => {
    try {
        if (!redisClient.isOpen) return;

        const count = await Song.countDocuments();
        const redisCount = await redisClient.sCard('song_titles');

        if (redisCount < count) {
            console.log('Seeding Redis with Song Titles...');
            const songs = await Song.find().select('title');
            for (const song of songs) {
                await redisClient.sAdd('song_titles', song.title);
            }
            console.log('Redis Seeding Complete!');
        }
    } catch (err) {
        console.error('Redis Seeding Error:', err);
    }
};

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB Connected');
        await seedRedis();
    })
    .catch((err) => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/songs', require('./routes/songs'));
app.use('/categories', require('./routes/categories'));

app.get('/', (req, res) => {
    res.send('Spotify Clone Backend API');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
