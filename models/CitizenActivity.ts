import { Schema, model, models } from 'mongoose';
import type { CitizenActivityCategory, CitizenActivityPriority } from '@/lib/citizen-activity/types';

export type CitizenActivityResolutionStatus = 'pending' | 'completed';

export interface ICitizenActivity {
    userId: Schema.Types.ObjectId;
    category: CitizenActivityCategory;
    title: string;
    description: string;
    details?: string;
    location: string;
    lat?: number | null;
    lng?: number | null;
    userState?: string;
    userCity?: string;
    citizenName: string;
    citizenAddress: string;
    citizenPhone?: string;
    priority: CitizenActivityPriority;
    status: string;
    resolutionStatus: CitizenActivityResolutionStatus;
    takeAction: string;
    source: 'citizen' | 'system' | 'responder';
    reviewedBy?: Schema.Types.ObjectId | null;
    reviewedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const CitizenActivitySchema = new Schema<ICitizenActivity>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        category: {
            type: String,
            required: true,
            enum: [
                'help_request',
                'shelter_checkin',
                'power_outage',
                'medical_assistance',
                'safe_checkin',
                'supply_request',
                'evacuation',
                'road_hazard',
                'damage_report',
                'water_rescue',
                'volunteer',
                'missing_person',
            ],
            index: true,
        },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        details: { type: String, default: '', trim: true },
        location: { type: String, default: '', trim: true, index: true },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        userState: { type: String, default: '', trim: true, index: true },
        userCity: { type: String, default: '', trim: true },
        citizenName: { type: String, default: '', trim: true },
        citizenAddress: { type: String, default: '', trim: true },
        citizenPhone: { type: String, default: '', trim: true },
        priority: {
            type: String,
            enum: ['critical', 'high', 'normal', 'low'],
            default: 'normal',
        },
        status: { type: String, default: 'Open', trim: true, index: true },
        resolutionStatus: {
            type: String,
            enum: ['pending', 'completed'],
            default: 'pending',
            index: true,
        },
        takeAction: { type: String, default: '', trim: true },
        source: {
            type: String,
            enum: ['citizen', 'system', 'responder'],
            default: 'citizen',
        },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

CitizenActivitySchema.index({ createdAt: -1 });
CitizenActivitySchema.index({ category: 1, createdAt: -1 });
CitizenActivitySchema.index({ resolutionStatus: 1, createdAt: -1 });

const CitizenActivity =
    models.CitizenActivity || model<ICitizenActivity>('CitizenActivity', CitizenActivitySchema);

export default CitizenActivity;
