import cron from 'node-cron';
import { ActiveTimerModel } from '../model/activeTimer.model';
import { TaskModel } from '../model/task.model';
import User from '../model/user.model';
import { sendNotificationToUsers } from '../controller/firebasenotification.controller';
import { getSocket } from '../config/socketio.config';

export class TimerBackgroundService {
  static startBackgroundCheck() {
    // Run every minute to check for overtime timers
    cron.schedule(
      '* * * * *',
      async () => {
        try {
          const activeTimers = await ActiveTimerModel.find().populate('task_id');

          for (const activeTimer of activeTimers) {
            const task = await TaskModel.findById(activeTimer.task_id);
            if (task) {
              const estimatedMs = task.total_estimated_time;
              const currentTime = new Date(new Date().toUTCString());
              const elapsedTime = currentTime.getTime() - activeTimer.start_time.getTime();

              if (elapsedTime + task.actual_time_spent >= estimatedMs) {
                task.actual_time_spent = task.total_estimated_time;
                task.timer_start_time = null;
                task.is_timer_active = false;
                task.timer_status = 'completed';

                task.timer_sessions.push({
                  start_time: activeTimer.start_time,
                  end_time: currentTime,
                  duration: elapsedTime,
                });

                const users = await User.find({ _id: { $in: [task.assigned_to] }, fpn_token: { $ne: null } });
                const tokens = users.map((user: any) => user.fpn_token).filter(Boolean);

                if (tokens.length > 0) {
                  sendNotificationToUsers(tokens, 'Task Timer Stopped', `Your task timer has stopped - exceeded estimated time`);
                }

                await task.save();

                await ActiveTimerModel.deleteOne({ _id: activeTimer._id });

                const { io } = getSocket();
                io?.to(activeTimer?.user_id?.toString() ?? '').emit('timerAutoStopped', {
                  taskId: task._id,
                  message: 'Timer automatically stopped - exceeded estimated time',
                });
              }
            }
          }
        } catch (error) {
          console.error('Error in background timer check:', error);
        }
      },
      {
        timezone: 'Asia/Kolkata',
      }
    );
  }
}
