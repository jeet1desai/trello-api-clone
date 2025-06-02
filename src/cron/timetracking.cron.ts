import cron from 'node-cron';
import { ActiveTimerModel } from '../model/activeTimer.model';
import { TaskModel } from '../model/task.model';

export class TimerBackgroundService {
  static startBackgroundCheck() {
    // Run every minute to check for overtime timers
    cron.schedule('* * * * *', async () => {
      try {
        const activeTimers = await ActiveTimerModel.find().populate('task_id');

        for (const activeTimer of activeTimers) {
          const task = await TaskModel.findById(activeTimer.task_id);
          if (task) {
            const currentTime = new Date();
            const elapsedTime = currentTime.getTime() - activeTimer.start_time.getTime();

            // Check if timer has exceeded estimated time
            if (elapsedTime >= task.total_estimated_time) {
              // Update task
              task.actual_time_spent += elapsedTime;
              task.timer_start_time = null;
              task.is_timer_active = false;
              task.timer_status = 'completed';

              // Add session to history
              task.timer_sessions.push({
                start_time: activeTimer.start_time,
                end_time: currentTime,
                duration: elapsedTime,
              });

              await task.save();

              // Remove active timer
              await ActiveTimerModel.deleteOne({ _id: activeTimer._id });

              // Here you could also emit a socket event to notify the user
              // io.to(activeTimer.userId.toString()).emit('timerAutoStopped', {
              //   taskId: task._id,
              //   message: 'Timer automatically stopped - exceeded estimated time'
              // });
            }
          }
        }
      } catch (error) {
        console.error('Error in background timer check:', error);
      }
    });
  }
}
