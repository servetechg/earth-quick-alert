import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
/** Use `MONGODB_DB` to override; defaults to `ready2go` when the URI has no database path. */
const DEFAULT_DB = process.env.MONGODB_DB || 'ready2go';

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
}

/** Ensures a database name so collections resolve (e.g. users) instead of defaulting to `test`. */
function withDefaultDatabase(uri: string): string {
    try {
        const u = new URL(uri);
        if (u.pathname === '/' || u.pathname === '') {
            u.pathname = `/${DEFAULT_DB}`;
            return u.href;
        }
        return uri;
    } catch {
        const q = uri.includes('?') ? uri.slice(uri.indexOf('?')) : '';
        const base = q ? uri.slice(0, uri.indexOf('?')) : uri;
        const afterScheme = base.split('://')[1] ?? '';
        const lastSlash = afterScheme.lastIndexOf('/');
        const afterSlash = lastSlash >= 0 ? afterScheme.slice(lastSlash + 1) : '';
        if (afterSlash.length > 0) return uri;
        return `${base.replace(/\/$/, '')}/${DEFAULT_DB}${q}`;
    }
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

    const connectionString = withDefaultDatabase(MONGODB_URI);

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(connectionString, opts).then((mongoose) => {
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