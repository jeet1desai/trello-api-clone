import cron from 'node-cron';
import { TaskModel } from '../model/task.model';
import { RepeatTaskModel } from '../model/repeatTask.model';
import { MemberModel } from '../model/members.model';
import { getSocket } from '../config/socketio.config';
import { saveRecentActivity } from '../helper/recentActivityService';
import { TaskLabelModel } from '../model/taskLabel.model';
import { TaskMemberModel } from '../model/taskMember.model';

export class RepeatTaskRunnerService {
  static startBackgroundCheck() {
    cron.schedule('0 0 * * *', async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

        const repeatTasks = await RepeatTaskModel.find({
          $expr: {
            $and: [
              {
                $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$next_repeat_on' } }, todayStr],
              },
              {
                $gte: [{ $dateToString: { format: '%Y-%m-%d', date: '$end_date' } }, todayStr],
              },
            ],
          },
        });

        for (const repeat of repeatTasks) {
          // Find the original task
          const originalTask = await TaskModel.findById(repeat.task_id).lean();
          if (!originalTask) {
            continue;
          }

          const requestingMember = await MemberModel.findOne({ boardId: originalTask.board_id, memberId: repeat.created_by });

          if (!requestingMember) {
            continue;
          }

          // Create a new task with the same properties
          const repeatedTask = new TaskModel({
            title: originalTask.title,
            description: originalTask.description,
            board_id: originalTask.board_id,
            status_list_id: originalTask.status_list_id,
            created_by: repeat.created_by,
            assigned_to: originalTask.assigned_to,
            start_date: originalTask.start_date,
            end_date: originalTask.end_date,
            priority: originalTask.priority,
            position: 0,
            status: originalTask.status,
            attachment: originalTask.attachment,
            estimated_hours: originalTask.estimated_hours,
            estimated_minutes: originalTask.estimated_minutes,
          });
          const savedTask = await repeatedTask.save();

          // Duplicate task members if any
          const taskMembers = await TaskMemberModel.find({ task_id: repeat.task_id });
          if (taskMembers.length > 0) {
            const newTaskMembers = taskMembers.map((member) => ({
              task_id: savedTask._id,
              member_id: member.member_id,
              board_id: originalTask.board_id,
            }));
            await TaskMemberModel.insertMany(newTaskMembers);
          }

          // Duplicate task labels if any
          const taskLabels = await TaskLabelModel.find({ task_id: repeat.task_id });
          if (taskLabels.length > 0) {
            const newTaskLabels = taskLabels.map((label) => ({
              task_id: savedTask._id,
              label_id: label.label_id,
            }));
            await TaskLabelModel.insertMany(newTaskLabels);
          }

          // Emit socket event for the new task
          const { io } = getSocket();
          if (io) {
            io.to(originalTask.board_id?.toString() ?? '').emit('receive-new-task', {
              data: savedTask,
            });
          }

          // Save recent activity
          const members = await MemberModel.find({ boardId: originalTask.board_id }).select('memberId');
          const visibleUserIds = members.map((m: any) => m.memberId.toString());

          await saveRecentActivity(
            repeat.created_by.toString(),
            'Repeated',
            'Task',
            originalTask.board_id?.toString() ?? '',
            visibleUserIds,
            `Task "${originalTask.title}" was repeated.`
          );

          // Compute next repeat date
          const nextDate = getNextRepeatDate(repeat.repeat_type, todayStr);

          if (nextDate > repeat.end_date) {
            await RepeatTaskModel.findByIdAndDelete(repeat._id);
          } else {
            await RepeatTaskModel.findByIdAndUpdate(repeat._id, { next_repeat_on: nextDate });
          }
        }
      } catch (error) {
        console.error('Error in repeat task check:', error);
      }
    });
  }
}

function getNextRepeatDate(type: string, fromDate: Date | string): Date {
  const baseDate = new Date(fromDate);
  baseDate.setUTCHours(0, 0, 0, 0); // Normalize input to 00:00:00 UTC

  const next = new Date(baseDate);

  if (type === 'daily') {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (type === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (type === 'monthly') {
    const originalDay = next.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + 1);

    // Fix month overflow (e.g., Feb 30 → Feb 28)
    while (next.getUTCDate() < originalDay && next.getUTCMonth() !== (baseDate.getUTCMonth() + 1) % 12) {
      next.setUTCDate(next.getUTCDate() - 1);
    }
  }

  next.setUTCHours(0, 0, 0, 0); // Ensure output is at midnight UTC
  return next;
}
