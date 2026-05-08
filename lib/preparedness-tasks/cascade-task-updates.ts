import mongoose from 'mongoose';
import SubAdminTask from '@/models/SubAdminTask';
import UserTask from '@/models/UserTask';

function asOid(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** Super-admin edited a source `Task` title — sync all `SubAdminTask` copies and `UserTask` rows. */
export async function syncDownstreamFromSuperAdminTaskTitle(
  sourceTaskId: string | mongoose.Types.ObjectId,
  title: string
): Promise<void> {
  const sid = asOid(sourceTaskId);
  await SubAdminTask.updateMany({ sourceTaskId: sid }, { $set: { title } });
  const subIds = await SubAdminTask.find({ sourceTaskId: sid }).distinct('_id');
  if (subIds.length === 0) return;
  await UserTask.updateMany({ taskId: { $in: subIds } }, { $set: { title } });
}

/** Super-admin soft-deleted source `Task`(s) — remove user copies and retire sub-admin copies. */
export async function syncDownstreamFromSuperAdminTasksDeleted(
  sourceTaskIds: Array<string | mongoose.Types.ObjectId>
): Promise<void> {
  if (sourceTaskIds.length === 0) return;
  const oids = sourceTaskIds.map(asOid);
  const subDocs = await SubAdminTask.find({ sourceTaskId: { $in: oids } }).select('_id').lean();
  const subIds = subDocs.map((d) => d._id as mongoose.Types.ObjectId);
  if (subIds.length > 0) {
    await UserTask.deleteMany({ taskId: { $in: subIds } });
  }
  await SubAdminTask.updateMany(
    { sourceTaskId: { $in: oids } },
    { $set: { isActive: false, isDeletedBySubAdmin: true } }
  );
}

/** Sub-admin edited their `SubAdminTask` — sync title on assigned `UserTask` rows. */
export async function syncUserTasksTitleFromSubAdminTask(
  subAdminTaskId: string | mongoose.Types.ObjectId,
  title: string
): Promise<void> {
  const tid = asOid(subAdminTaskId);
  await UserTask.updateMany({ taskId: tid }, { $set: { title } });
}

/** Sub-admin removed their `SubAdminTask` — drop assigned `UserTask` rows (sent copies). */
export async function removeUserTasksForSubAdminTask(
  subAdminTaskId: string | mongoose.Types.ObjectId
): Promise<void> {
  const tid = asOid(subAdminTaskId);
  await UserTask.deleteMany({ taskId: tid });
}

/** Batch: sub-admin deleted multiple tasks. */
export async function removeUserTasksForSubAdminTasks(
  subAdminTaskIds: Array<string | mongoose.Types.ObjectId>
): Promise<void> {
  if (subAdminTaskIds.length === 0) return;
  const oids = subAdminTaskIds.map(asOid);
  await UserTask.deleteMany({ taskId: { $in: oids } });
}
