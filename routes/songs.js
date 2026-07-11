const express = require('express');
const router = express.Router();
const Song = require('../models/Song');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const redisClient = require('../utils/redis');
const { s3, generatePresignedUrl } = require('../utils/s3');

// --- REDIS CACHING ROUTES ---

// GET /songs/trending - Fetch Top 10 Trending Songs (Cached)
router.get('/trending', async (req, res) => {
    const cacheKey = 'trending_songs';
    try {
        // 1. Try Redis
        if (redisClient.isOpen) {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                console.log('Serving Trending from Redis');
                return res.json(JSON.parse(cachedData));
            }
        }

        // 2. Fetch from DB
        console.log('Cache Miss! Fetching Trending from Main DB');
        const songs = await Song.find().sort({ plays: -1 }).limit(10).lean();

        // Generate Presigned URLs for them
        const songsWithUrls = await Promise.all(
            songs.map(async (song) => ({
                ...song,
                imageUrl: await generatePresignedUrl(song.thumbnailUrl),
                url: await generatePresignedUrl(song.s3Key),
                streamUrl: `${process.env.backend_url || 'http://localhost:7000'}/songs/stream/${song._id}`
            }))
        );

        // 3. Save to Redis (1 hour)
        if (redisClient.isOpen) {
            await redisClient.setEx(cacheKey, 3600, JSON.stringify(songsWithUrls));
        }

        res.json(songsWithUrls);

    } catch (err) {
        console.error('Error fetching trending songs:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// GET /songs/search/autocomplete - Redis Set based autocomplete
router.get('/search/autocomplete', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);

    try {
        // Simple approach: Use Redis 'SCAN' or 'SSCAN' if you have a set of all titles
        // or just rely on MongoDB text search if Redis is overkill for now, 
        // BUT user asked for "Store song titles in a set".
        // Let's assume we maintain a set 'song_titles'

        // Note: Redis Sets are exact match or random iteration. 
        // For "autocomplete" usually we use Sorted Sets (ZSET) with lexicographical ordering
        // OR simply scan the set and filter in app (not efficient for huge data but fine here).

        // Let's try to find matches in the 'song_titles' set
        if (!redisClient.isOpen) return res.json([]);

        // This is a naive implementation: Get all and filter. 
        // For production, use ZRANGEBYLEX or RediSearch.
        // Or if the set is small (< 10k), SMEMBERS is okay.

        // Check if we have titles cached?
        const allTitles = await redisClient.sMembers('song_titles'); // Returns array
        if (!allTitles.length) {
            // Fallback: Use MongoDB regex if Redis is empty
            const songs = await Song.find({ title: { $regex: query, $options: 'i' } }).limit(5).select('title');
            return res.json(songs.map(s => s.title));
        }

        const matches = allTitles.filter(t => t.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
        res.json(matches);

    } catch (err) {
        console.error('Autocomplete Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// POST /songs/:id/play - Increment plays & add to History
router.post('/:id/play', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body; // Expecting userId

    try {
        // 1. Increment in MongoDB (async/reliable)
        await Song.findByIdAndUpdate(id, { $inc: { plays: 1 } });

        // 2. Invalidate trending cache so it updates eventually (or let it expire)
        // await redisClient.del('trending_songs'); // Optional: instant update

        if (redisClient.isOpen) {
            // 3. User History (Redis List)
            if (userId) {
                const historyKey = `user:${userId}:recent`;
                await redisClient.lPush(historyKey, id);
                await redisClient.lTrim(historyKey, 0, 4); // Keep only last 5
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Play Count Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// GET /songs/recent - Get User's Recent Songs
router.get('/recent', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        if (!redisClient.isOpen) return res.json([]);

        // Get IDs from Redis
        const songIds = await redisClient.lRange(`user:${userId}:recent`, 0, -1);
        if (!songIds || songIds.length === 0) return res.json([]);

        // Fetch details from DB (preserve order if possible, or just fetch)
        const songs = await Song.find({ _id: { $in: songIds } }).lean();

        // Helper to order them by the recent list (since $in doesn't guarantee order)
        const orderedSongs = songIds.map(id => songs.find(s => s._id.toString() === id)).filter(Boolean);

        // Generate URLs
        const detailedSongs = await Promise.all(
            orderedSongs.map(async (song) => ({
                ...song,
                imageUrl: await generatePresignedUrl(song.thumbnailUrl),
                url: await generatePresignedUrl(song.s3Key),
                streamUrl: `${process.env.backend_url || 'http://localhost:7000'}/songs/stream/${song._id}`
            }))
        );

        res.json(detailedSongs);

    } catch (err) {
        console.error('Recent Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});


// POST /songs/:id/like - Like a song
router.post('/:id/like', async (req, res) => {
    const { id } = req.params;
    // const { userId } = req.body; // If tracking user likes

    try {
        // 1. Redis Increment
        if (redisClient.isOpen) {
            await redisClient.incr(`song:${id}:likes`);
        }

        // 2. MongoDB Sync (Instant or Batch)
        // For now, instant sync
        const updatedSong = await Song.findByIdAndUpdate(id, { $inc: { likes: 1 } }, { new: true });

        res.json({ likes: updatedSong.likes });

    } catch (err) {
        console.error('Like Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- END REDIS ROUTES ---



// GET /songs - Fetch Songs with Caching & Pagination
router.get('/', async (req, res) => {
    try {
        const { cursor, limit = 20, category, search, albumMovie } = req.query;
        const limitInt = parseInt(limit);
        const cacheKey = `songs:${JSON.stringify(req.query)}`;

        // 1. Check Redis Cache
        let cachedData = null;
        try {
            if (redisClient.isOpen) {
                cachedData = await redisClient.get(cacheKey);
            }
        } catch (redisError) {
            console.error('Redis Get Error:', redisError);
        }

        if (cachedData) {
            console.log('Cache Hit');
            return res.json(JSON.parse(cachedData));
        }

        console.log('Cache Miss');

        let query = {};
        if (category) query.category = category;
        if (albumMovie) query.albumMovie = albumMovie;
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { title: searchRegex },
                { artist: searchRegex },
                { albumMovie: searchRegex }
            ];
        }
        if (cursor) {
            query._id = { $lt: cursor };
        }

        // 2. Fetch from MongoDB with .lean() and Projections
        const songs = await Song.find(query)
            .sort({ _id: -1 })
            .limit(limitInt)
            .select('title artist albumMovie category s3Key thumbnailUrl duration') // Projection
            .lean(); // Lean for POJOs

        // 3. Generate Presigned URLs (Dynamically)
        const songsWithUrls = await Promise.all(
            songs.map(async (song) => ({
                ...song,
                imageUrl: await generatePresignedUrl(song.thumbnailUrl),
                url: await generatePresignedUrl(song.s3Key), // We still provide a full URL for fallback/basic play
                streamUrl: `${process.env.backend_url || 'http://localhost:7000'}/songs/stream/${song._id}` // Custom Stream URL
            }))
        );

        const nextCursor = songs.length === limitInt ? songs[songs.length - 1]._id : null;
        const responseData = { songs: songsWithUrls, nextCursor };

        // 4. Store in Redis (1 Hour Expiration)
        try {
            if (redisClient.isOpen) {
                await redisClient.setEx(cacheKey, 3600, JSON.stringify(responseData));
            }
        } catch (redisError) {
            console.error('Redis Set Error:', redisError);
        }

        res.json(responseData);
    } catch (err) {
        console.error('Error in GET /songs:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// GET /songs/stream/:id - HTTP 206 Streaming
router.get('/stream/:id', async (req, res) => {
    try {
        const song = await Song.findById(req.params.id).select('s3Key').lean();
        if (!song || !song.s3Key) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const range = req.headers.range;
        if (!range) {
            return res.status(400).send('Requires Range header');
        }

        const bucketParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: song.s3Key,
        };

        // Get Object Metadata to determine content length
        // We need to fetch the object from S3 with the range to get the stream
        // But first let's just use the range to request from S3

        const command = new GetObjectCommand({
            ...bucketParams,
            Range: range,
        });

        const { ContentRange, AcceptRanges, ContentLength, Body, ContentType } = await s3.send(command);

        res.writeHead(206, {
            'Content-Range': ContentRange,
            'Accept-Ranges': AcceptRanges,
            'Content-Length': ContentLength,
            'Content-Type': ContentType || 'audio/mpeg',
        });

        Body.pipe(res);

    } catch (err) {
        console.error('Error in Stream:', err);
        res.status(500).json({ error: 'Streaming Error' });
    }
});

module.exports = router;
