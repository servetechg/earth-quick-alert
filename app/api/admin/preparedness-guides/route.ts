import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PreparednessGuide from '@/models/PreparednessGuide';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

const SEED_GUIDES = [
    { category: 'individual_evacuation', order: 1 },
    { category: 'community_evacuation', order: 2 },
    { category: 'shelter_in_place', order: 3 },
    { category: 'active_shooter', order: 4 },
    { category: 'household_pets', order: 5 },
    { category: 'large_animals', order: 6 },
    { category: 'identity_theft', order: 7 },
];

export async function GET() {
    try {
        await connectDB();

        type GuideLean = {
            _id: mongoose.Types.ObjectId;
            category: string;
            order?: number;
        };

        let guides = (await PreparednessGuide.find().sort({ order: 1, category: 1 }).lean()) as unknown as GuideLean[];

        if (guides.length === 0) {
            console.log('Seeding Preparedness Guides into MongoDB...');
            await PreparednessGuide.insertMany(SEED_GUIDES);
            guides = (await PreparednessGuide.find().sort({ order: 1, category: 1 }).lean()) as unknown as GuideLean[];
        }

        const formattedGuides: Record<string, { id: string; category: string; order: number }> = {};
        for (const g of guides) {
            formattedGuides[g.category] = {
                id: g._id.toString(),
                category: g.category,
                order: g.order ?? 0,
            };
        }

        return NextResponse.json({
            success: true,
            data: formattedGuides,
        });
    } catch (error) {
        console.error('Error fetching preparedness guides:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch preparedness guides' }, { status: 500 });
    }
}
