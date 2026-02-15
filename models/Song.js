const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  albumMovie: { type: String }, // Can be Album or Movie depending on context
  category: { type: String, required: true }, // e.g., 'Bollywood', 'Hollywood'
  s3Key: { type: String, required: true, unique: true },
  duration: { type: Number }, // in seconds
  thumbnailUrl: { type: String }, // Optional: separate thumbnail if available
  plays: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
SongSchema.index({ category: 1 });
SongSchema.index({ artist: 1 });
SongSchema.index({ albumMovie: 1 });
SongSchema.index({ title: 'text' }); // basics for search if needed

module.exports = mongoose.model('Song', SongSchema);
