const express = require('express');
const router = express.Router();
const Song = require('../models/Song');
const redisClient = require('../utils/redis');
const { generatePresignedUrl } = require('../utils/s3');

// GET /categories - Fetch unique categories
router.get('/', async (req, res) => {
    try {
        const categories = await Song.distinct('category');
        res.json(categories);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// GET /categories/:category/albums
// Groups songs in the category by `albumMovie` and returns one card per movie/album.
// Each card includes cover image (from any song in the group), song count and top artists.
router.get('/:category/albums', async (req, res) => {
    const { category } = req.params;
    const cacheKey = `albums:${category}`;

    try {
        // Redis cache
        if (redisClient.isOpen) {
            const cached = await redisClient.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));
        }

        const albums = await Song.aggregate([
            { $match: { category, albumMovie: { $ne: null } } },
            {
                $group: {
                    _id: '$albumMovie',
                    songCount: { $sum: 1 },
                    // Prefer a document that actually has a thumbnail
                    thumbnailUrl: {
                        $first: {
                            $cond: [{ $ifNull: ['$thumbnailUrl', false] }, '$thumbnailUrl', null],
                        },
                    },
                    fallbackThumb: { $max: '$thumbnailUrl' },
                    artists: { $addToSet: '$artist' },
                    totalPlays: { $sum: '$plays' },
                },
            },
            { $sort: { totalPlays: -1, songCount: -1, _id: 1 } },
        ]);

        const withUrls = await Promise.all(
            albums.map(async (a) => {
                const key = a.thumbnailUrl || a.fallbackThumb || null;
                return {
                    albumMovie: a._id,
                    songCount: a.songCount,
                    artists: a.artists.filter(Boolean).slice(0, 3),
                    artistLine: a.artists.filter(Boolean).slice(0, 2).join(', ') || 'Various Artists',
                    totalPlays: a.totalPlays,
                    imageUrl: await generatePresignedUrl(key),
                };
            })
        );

        if (redisClient.isOpen) {
            await redisClient.setEx(cacheKey, 3600, JSON.stringify(withUrls));
        }

        res.json(withUrls);
    } catch (err) {
        console.error('Albums Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
