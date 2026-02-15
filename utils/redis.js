const redis = require('redis');

const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 5) {
                console.log('Redis: Max retries reached. Stopping reconnection attempts.');
                return new Error('Redis connection failed');
            }
            return Math.min(retries * 50, 500);
        }
    }
});

client.on('error', (err) => {
    // Suppress intense error logging for ECONNREFUSED if we are handling it
    if (err.code === 'ECONNREFUSED') {
        // console.log('Redis: Connection refused (is the server running?)');
    } else {
        console.log('Redis Client Error', err.message);
    }
});

(async () => {
    try {
        if (!client.isOpen) {
            await client.connect();
            console.log('Redis Connected');
        }
    } catch (err) {
        // This catch block handles the initial connection failure if await client.connect() throws
        console.log('Redis Connection Failed (Proceeding without Cache):', err.message);
    }
})();

module.exports = client;
