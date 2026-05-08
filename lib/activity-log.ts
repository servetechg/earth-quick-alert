import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';

export { ACTIVITY_ACTIONS } from '@/lib/activity-actions';

type RecordActivityParams = {
  userId: string | null | undefined;
  action: string;
  label: string;
  meta?: Record<string, unknown>;
};

export async function recordActivity(params: RecordActivityParams): Promise<void> {
  const id = params.userId?.toString?.().trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return;

  const label = params.label.trim().slice(0, 500);
  if (!label) return;

  try {
    await connectDB();
    await ActivityLog.create({
      userId: id,
      action: params.action.slice(0, 120),
      label,
      meta: params.meta && typeof params.meta === 'object' ? params.meta : {},
    });
  } catch (e) {
    console.error('[activity-log] recordActivity failed:', e);
  }
}
