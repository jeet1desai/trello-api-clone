import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import {
  addEstimatedTimeHandler,
  createTaskHandler,
  deleteAttachmentHandler,
  deleteTaskHandler,
  duplicateTaskHandler,
  exportTasks,
  getAttachmentHandler,
  getTaskByIdHandler,
  getTaskByStatusIdHandler,
  getTimerStatusHandler,
  getUpcomingDeadlineTasksHandler,
  importTasksFromCSV,
  repeatTaskHandler,
  startTimerHandler,
  stopTimerHandler,
  updateTaskHandler,
  uploadAttachmentHandler,
} from '../controller/task.controller';
import { TimerBackgroundService } from '../cron/timetracking.cron';
import multer from 'multer';
import { validateFileUpload } from '../middleware/validateCSVFile';
import { RepeatTaskRunnerService } from '../cron/repeatTaskRunner.cron';
const upload = multer();
const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/create-task', createTaskHandler);
taskRouter.post('/duplicate-task', duplicateTaskHandler);
taskRouter.post('/repeat-task', repeatTaskHandler);
taskRouter.post('/get-task', getTaskByStatusIdHandler);
taskRouter.get('/upcoming-deadlines', getUpcomingDeadlineTasksHandler);
taskRouter.get('/get-task/:id', getTaskByIdHandler);
taskRouter.put('/add-estimated-time', addEstimatedTimeHandler);
taskRouter.put('/start-timer/:id', startTimerHandler);
taskRouter.put('/stop-timer/:id', stopTimerHandler);
taskRouter.get('/time-tracking/timer-status/:id', getTimerStatusHandler);
taskRouter.put('/update-task', updateTaskHandler);
taskRouter.delete('/delete-task/:id', deleteTaskHandler);
taskRouter.post('/attachment', upload.array('attachment', 10), uploadAttachmentHandler);
taskRouter.delete('/delete-attachment', deleteAttachmentHandler);
taskRouter.get('/get-attachment', getAttachmentHandler);
taskRouter.post('/import-csv', upload.single('file'), validateFileUpload, importTasksFromCSV);
taskRouter.get('/export-csv/:boardId', exportTasks);

TimerBackgroundService.startBackgroundCheck();
RepeatTaskRunnerService.startBackgroundCheck();

export default taskRouter;
