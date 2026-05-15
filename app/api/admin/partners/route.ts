import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Partner from '@/models/Partner';

// Default seed data matching the original hardcoded arrays in the page
const SEED_PARTNERS = [
    {
        name: 'Red Cross',
        type: 'nonprofit',
        function: 'Sheltering',
        area: 'North Zone',
        status: 'Active',
        contact: 'Assigned',
    },
    {
        name: 'World Central Kitchen',
        type: 'nonprofit',
        function: 'Food Services',
        area: 'Central Hub',
        status: 'Active',
        contact: 'Assigned',
    },
    {
        name: 'PowerCo',
        type: 'business',
        sector: 'Utilities',
        support: 'Power Restoration',
        area: 'Industrial Zone',
        status: 'Active',
    },
    {
        name: 'PharmaPlus',
        type: 'business',
        sector: 'Pharmacy',
        support: 'Medication Access',
        area: 'East District',
        status: 'Active',
    },
];

export async function GET() {
    try {
        await connectDB();

        let partners = await Partner.find().lean();

        // Auto-seed defaults on first boot
        if (partners.length === 0) {
            console.log('Seeding default Partners into MongoDB...');
            await Partner.insertMany(SEED_PARTNERS);
            partners = await Partner.find().lean();
        }

        const nonprofits = partners
            .filter((p: any) => p.type === 'nonprofit')
            .map((p: any) => ({
                id: p._id.toString(),
                name: p.name,
                function: p.function,
                area: p.area,
                status: p.status,
                contact: p.contact,
            }));

        const businesses = partners
            .filter((p: any) => p.type === 'business')
            .map((p: any) => ({
                id: p._id.toString(),
                name: p.name,
                sector: p.sector,
                support: p.support,
                area: p.area,
                status: p.status,
            }));

        return NextResponse.json({ success: true, data: { nonprofits, businesses } });
    } catch (error) {
        console.error('Error fetching partners:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch partners' }, { status: 500 });
    }
}
