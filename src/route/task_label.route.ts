import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { addTaskLabelHandler, getTaskLabelHandler, deleteTaskLabelHandler } from '../controller/tasklabel.controller';

const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/add', addTaskLabelHandler);
taskRouter.delete('/delete', deleteTaskLabelHandler);
taskRouter.get('/get/:taskId', getTaskLabelHandler);

export default taskRouter;
