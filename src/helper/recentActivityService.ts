import { getSocket } from '../config/socketio.config';
import { RecentActivityModel } from '../model/recentactivity.model';
import { emitToUser } from '../utils/socket';

export const saveRecentActivity = async (
  userId: string,
  action: string,
  module: string,
  boardId: string,
  visibleToUserIds: string[],
  details?: string,
  taskId?: string
) => {
  try {
    const activityData: any = {
      created_by: userId,
      action,
      module,
      visible_to: visibleToUserIds,
      details,
    };

    if (boardId) {
      activityData.board = boardId;
    }
    if (taskId) {
      activityData.task = taskId;
    }
    const results = await RecentActivityModel.create(activityData);

    const activity = await RecentActivityModel.findOne({
      _id: results._id,
    })
      .populate({
        path: 'created_by',
        select: '_id first_name middle_name last_name email profile_image',
      })
      .populate({
        path: 'task',
        select: '_id title',
      });

    const { io } = getSocket();

    for (const user of visibleToUserIds) {
      await emitToUser(io, user, 'receive-recent-activity', { data: activity });
    }

    return activity;
  } catch (error: any) {
    throw new Error(`Recent Activity failed: ${error.message}`);
  }
};
