import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import * as taskController from '../controller/task.controller';
import { TimerBackgroundService } from '../cron/timetracking.cron';
import multer from 'multer';
import { validateFileUpload } from '../middleware/validateCSVFile';
import { RepeatTaskRunnerService } from '../cron/repeatTaskRunner.cron';

const taskRouter = express.Router();
const upload = multer();

taskRouter.use(userMiddleware);
taskRouter.post('/create-task', taskController.createTaskHandler);
taskRouter.post('/duplicate-task', taskController.duplicateTaskHandler);
taskRouter.post('/repeat-task', taskController.repeatTaskHandler);
taskRouter.post('/get-task', taskController.getTaskByStatusIdHandler);
taskRouter.get('/upcoming-deadlines', taskController.getUpcomingDeadlineTasksHandler);
taskRouter.get('/get-task/:id', taskController.getTaskByIdHandler);
taskRouter.put('/add-estimated-time', taskController.addEstimatedTimeHandler);
taskRouter.put('/start-timer/:id', taskController.startTimerHandler);
taskRouter.put('/stop-timer/:id', taskController.stopTimerHandler);
taskRouter.get('/time-tracking/timer-status/:id', taskController.getTimerStatusHandler);
taskRouter.put('/update-task', taskController.updateTaskHandler);
taskRouter.delete('/delete-task/:id', taskController.deleteTaskHandler);
taskRouter.post('/attachment', upload.array('attachment', 10), taskController.uploadAttachmentHandler);
taskRouter.delete('/delete-attachment', taskController.deleteAttachmentHandler);
taskRouter.get('/get-attachment', taskController.getAttachmentHandler);
taskRouter.post('/import-csv', upload.single('file'), validateFileUpload, taskController.importTasksFromCSV);
taskRouter.get('/export-csv/:boardId', taskController.exportTasks);
taskRouter.post('/suggest-tasks', taskController.getTaskSuggestionsHandler);

TimerBackgroundService.startBackgroundCheck();
RepeatTaskRunnerService.startBackgroundCheck();

export default taskRouter;
