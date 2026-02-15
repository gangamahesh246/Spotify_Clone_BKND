const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');
const Song = require('../models/Song');
require('dotenv').config();

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const syncSongs = async () => {
    await connectDB();

    try {
        let continuationToken = undefined;
        const songsToUpsert = [];
        const imagesMap = new Map(); // Container/Folder -> S3 Key

        // 1. Scan S3 for all objects
        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                ContinuationToken: continuationToken,
            });

            const response = await s3.send(command);
            const contents = response.Contents || [];

            for (const item of contents) {
                const key = item.Key;
                const parts = key.split('/');

                // Identify Images (assuming loose structure, matching by folder name)
                if (key.match(/\.(jpg|jpeg|png|webp)$/i)) {
                    // Example: movie/Animal/poster.jpg -> Container: Animal
                    // Example: movie/Kabir Singh.jpg -> Container: Kabir Singh

                    let container;
                    if (parts.length >= 3) {
                        // movie/Animal/poster.jpg -> Animal
                        container = parts[parts.length - 2];
                    } else if (parts.length === 2 && parts[0] === 'movie') {
                        // movie/Animal.jpg -> Animal
                        container = parts[1].replace(/\.[^/.]+$/, "");
                    }

                    if (container) {
                        imagesMap.set(container.toLowerCase(), key);
                        console.log(`Found Image for: ${container}`);
                    }
                    continue;
                }

                if (!key.endsWith('.mp3')) continue;

                // Process Songs
                let category, container, fileName;

                if (parts.length >= 4 && parts[0] === 'music') {
                    category = parts[1];
                    container = parts[2];
                    fileName = parts[3];
                } else if (parts.length >= 3) {
                    category = parts[0];
                    container = parts[1];
                    fileName = parts[2];
                } else {
                    console.warn(`Skipping malformed key: ${key}`);
                    continue;
                }

                // Clean Title
                let title = fileName.replace(/\.mp3$/i, '');
                title = title.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();

                let artist = 'Unknown Artist';
                let albumMovie = 'Unknown Album';

                const lowerCat = category.toLowerCase();

                if (lowerCat.includes('bolly') || lowerCat.includes('tolly')) {
                    albumMovie = container;
                    artist = 'Various Artists';
                } else if (lowerCat.includes('holly')) {
                    artist = container;
                    albumMovie = 'Single';
                } else {
                    albumMovie = container;
                }

                songsToUpsert.push({
                    s3Key: key,
                    title,
                    artist,
                    albumMovie,
                    category,
                    container: container.toLowerCase() // For matching images
                });
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        // 2. Update Database
        for (const songData of songsToUpsert) {
            const imageKey = imagesMap.get(songData.container) ||
                imagesMap.get(songData.albumMovie.toLowerCase());

            await Song.findOneAndUpdate(
                { s3Key: songData.s3Key },
                {
                    title: songData.title,
                    artist: songData.artist,
                    albumMovie: songData.albumMovie,
                    category: songData.category,
                    s3Key: songData.s3Key,
                    thumbnailUrl: imageKey || null
                },
                { upsert: true, new: true }
            );
            console.log(`Synced: ${songData.title} (${songData.category}) ${imageKey ? '[Has Image]' : ''}`);
        }

        console.log('Sync Complete');
        process.exit(0);
    } catch (err) {
        console.error('Sync Error:', err);
        process.exit(1);
    }
};

syncSongs();
