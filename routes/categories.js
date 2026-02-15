const express = require('express');
const router = express.Router();
const Song = require('../models/Song');

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

module.exports = router;
