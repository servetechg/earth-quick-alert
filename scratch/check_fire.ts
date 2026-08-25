import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../lib/mongodb';
import UnifiedEvent from '../models/UnifiedEvent';

async function check() {
    await connectDB();
    const fire = await UnifiedEvent.find({ name: /Pine Tree/i }).lean();
    console.log('Pine Tree Fire in DB:', fire.map((u: any) => ({ name: u.name, lat: u.lat, lng: u.lng, source: u.source })));
    process.exit(0);
}
check();
