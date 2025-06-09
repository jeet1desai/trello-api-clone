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
    cron.schedule('* * * * *', async () => {
      try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1);

        const repeatTasks = await RepeatTaskModel.find({
          next_repeat_on: {
            $gte: today,
            $lt: tomorrow,
          },
          end_date: {
            $gte: today,
            $lt: tomorrow,
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
          const nextDate = getNextRepeatDate(repeat.repeat_type, today);

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

function getNextRepeatDate(type: string, fromDate: Date): Date {
  const next = new Date(fromDate);

  if (type === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (type === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (type === 'monthly') {
    const originalDay = next.getDate();
    next.setMonth(next.getMonth() + 1);

    // Fix month overflow (e.g., Feb 30 -> Feb 28)
    while (next.getDate() < originalDay && next.getMonth() !== (fromDate.getMonth() + 1) % 12) {
      next.setDate(next.getDate() - 1);
    }
  }

  return next;
}
