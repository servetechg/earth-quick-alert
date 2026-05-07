import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PreparednessGuide from '@/models/PreparednessGuide';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await connectDB();
        let guides = await PreparednessGuide.find({}).sort({ order: 1, category: 1 });

        if (guides.length === 0) {
            const defaultGuides = [
                { category: 'individual_evacuation', order: 1 },
                { category: 'community_evacuation', order: 2 },
                { category: 'shelter_in_place', order: 3 },
                { category: 'active_shooter', order: 4 },
                { category: 'pets_household', order: 5 },
                { category: 'pets_large', order: 6 },
                { category: 'identity_theft', order: 7 },
                { category: 'choking_first_aid', order: 8 },
            ];

            await PreparednessGuide.insertMany(defaultGuides);
            guides = await PreparednessGuide.find({}).sort({ order: 1, category: 1 });
        }

        return NextResponse.json(guides);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching preparedness guides:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await connectDB();
        const body = await request.json();
        const { category, order } = body;

        if (!category || typeof category !== 'string') {
            return NextResponse.json({ error: 'category is required' }, { status: 400 });
        }

        const guide = await PreparednessGuide.findOneAndUpdate(
            { category },
            { category, ...(typeof order === 'number' ? { order } : {}) },
            { new: true, upsert: true }
        );

        return NextResponse.json(guide);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');

        if (!category) {
            return NextResponse.json({ error: 'Category is required' }, { status: 400 });
        }

        await PreparednessGuide.deleteOne({ category });
        return NextResponse.json({ message: 'Guide deleted successfully' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
