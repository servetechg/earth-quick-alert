import mongoose from 'mongoose';

export function isValidObjectId(id: unknown): id is string {
    return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

