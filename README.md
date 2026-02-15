# Spotify Backend

A robust Node.js backend service for managing music catalog operations, including song management, category organization, and cloud storage integration.

## Overview

This backend service provides RESTful APIs for managing music content, leveraging modern cloud infrastructure and caching strategies to ensure high performance and reliability.

## Tech Stack

- **Framework:** Express.js 5.2
- **Database:** MongoDB (via Mongoose 9.1)
- **Cache:** Redis 5.10
- **Cloud Storage:** AWS S3
- **Runtime:** Node.js (CommonJS)
- **CORS:** Enabled for cross-origin requests

## Project Structure

```
spotify_backend/
├── server.js              # Application entry point
├── package.json           # Project dependencies
├── models/
│   └── Song.js            # MongoDB Song model
├── routes/
│   ├── songs.js           # Song management endpoints
│   └── categories.js      # Category management endpoints
└── utils/
    ├── redis.js           # Redis cache utilities
    └── syncS3.js          # AWS S3 synchronization
```

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd spotify_backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory with the following variables:
   ```
   # Database
   MONGODB_URI=mongodb://localhost:27017/spotify

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # AWS S3
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your_bucket_name

   # Server
   PORT=3000
   NODE_ENV=development
   ```

## Running the Application

```bash
npm start
```

The server will start on the configured PORT (default: 3000).

## API Endpoints

### Songs
- `GET /api/songs` - Retrieve all songs
- `POST /api/songs` - Create a new song
- `GET /api/songs/:id` - Retrieve a specific song
- `PUT /api/songs/:id` - Update a song
- `DELETE /api/songs/:id` - Delete a song

### Categories
- `GET /api/categories` - Retrieve all categories
- `POST /api/categories` - Create a new category
- `GET /api/categories/:id` - Retrieve a specific category
- `PUT /api/categories/:id` - Update a category
- `DELETE /api/categories/:id` - Delete a category

## Features

- **Song Management:** Full CRUD operations on music tracks
- **Category Organization:** Organize songs into logical categories
- **S3 Integration:** Seamless cloud storage synchronization
- **Caching Layer:** Redis-powered caching for improved performance
- **CORS Support:** Enabled for frontend integration
- **Environment Configuration:** Secure environment-based configuration

## Development

### Prerequisites
- Node.js 16+
- MongoDB instance
- Redis instance
- AWS account with S3 access

### Testing

Currently, no tests are configured. To add testing:
```bash
npm install --save-dev jest
# or
npm install --save-dev mocha chai
```

## Security Considerations

- Environment variables are kept in `.env` (never commit to repository)
- MongoDB connection strings should use secure credentials
- AWS credentials must be properly managed with IAM roles
- CORS is configured to allow trusted origins
- Implement rate limiting in production

## Performance Optimization

- **Caching:** Redis caching reduces database load
- **S3 Sync:** Asynchronous synchronization prevents blocking
- **Connection Pooling:** MongoDB and Redis maintain persistent connections

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Cannot connect to MongoDB | Verify MongoDB is running and connection string is correct |
| Redis connection errors | Ensure Redis server is running on configured host/port |
| AWS S3 sync failures | Check AWS credentials and S3 bucket permissions |
| CORS errors | Verify CORS configuration matches frontend origin |

## Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'Add amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

## License

This project is licensed under the ISC License - see the package.json file for details.

## Support

For issues, feature requests, or questions, please open an issue in the repository.

## Deployment

### Production Checklist
- [ ] All environment variables configured
- [ ] MongoDB and Redis instances provisioned
- [ ] AWS S3 bucket created and configured
- [ ] Security groups/firewall rules configured
- [ ] Error logging and monitoring enabled
- [ ] Rate limiting implemented
- [ ] API documentation deployed

