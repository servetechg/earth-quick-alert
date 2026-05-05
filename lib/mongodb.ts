import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!MONGODB_URI) {
        throw new Error(
            'Please define the MONGODB_URI environment variable inside .env.local or your deployment settings'
        );
    }

    let connectionString = MONGODB_URI;
    // try {
    //     if (connectionString.startsWith('mongodb+srv://')) {
    //         const url = new URL(connectionString);
    //         if (!url.pathname || url.pathname === '/') {
    //             url.pathname = '/ready2go';
    //             connectionString = url.toString();
    //         }
    //     }
    // } catch (err) {
    //     console.error('Error parsing MONGODB_URI:', err);

    // Manually handle database name for multi-host URIs (URL constructor fails on them)
    if (connectionString.includes('://')) {
        const [protocol, rest] = connectionString.split('://');
        const [hostsAndDb, query] = rest.split('?');

        // If there is no / after the last @ or after the protocol (if no @), or if it's just a trailing /
        const lastSlashIndex = hostsAndDb.lastIndexOf('/');
        const hasDb = lastSlashIndex !== -1 && lastSlashIndex !== 0 && hostsAndDb.substring(lastSlashIndex + 1).length > 0;

        if (!hasDb) {
            const cleanHosts = hostsAndDb.endsWith('/') ? hostsAndDb.slice(0, -1) : hostsAndDb;
            connectionString = `${protocol}://${cleanHosts}/ready2go${query ? '?' + query : ''}`;
            console.log('Appended database name to connection string');
        }
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        console.log('Connecting to MongoDB...');
        // Obfuscate URI for logging
        const obfuscatedUri = connectionString.replace(/:([^@]+)@/, ':****@');
        console.log(`Using URI: ${obfuscatedUri}`);

        cached.promise = mongoose.connect(connectionString, opts).then((mongoose) => {
            console.log('MongoDB connected successfully');
            return mongoose;
        }).catch((err) => {
            console.error('MongoDB connection error:', err);
            throw err;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        console.error('Failed to await MongoDB connection:', e);
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default connectDB;