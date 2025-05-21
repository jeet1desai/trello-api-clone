import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import {
  createTaskHandler,
  deleteAttachmentHandler,
  deleteTaskHandler,
  duplicateTaskHandler,
  getAttachmentHandler,
  getTaskByIdHandler,
  getTaskByStatusIdHandler,
  getUpcomingDeadlineTasksHandler,
  updateTaskHandler,
  uploadAttachmentHandler,
} from '../controller/task.controller';
import multer from 'multer';
const upload = multer();
const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/create-task', createTaskHandler);
taskRouter.post('/duplicate-task', duplicateTaskHandler);
taskRouter.post('/get-task', getTaskByStatusIdHandler);
taskRouter.get('/upcoming-deadlines', getUpcomingDeadlineTasksHandler);
taskRouter.get('/get-task/:id', getTaskByIdHandler);
taskRouter.put('/update-task', updateTaskHandler);
taskRouter.delete('/delete-task/:id', deleteTaskHandler);
taskRouter.post('/attachment', upload.array('attachment', 10), uploadAttachmentHandler);
taskRouter.delete('/delete-attachment', deleteAttachmentHandler);
taskRouter.get('/get-attachment', getAttachmentHandler);

export default taskRouter;
