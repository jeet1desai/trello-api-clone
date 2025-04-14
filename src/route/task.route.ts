import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { createTaskHandler, deleteTaskHandler, getTaskByStatusIdHandler, updateTaskHandler } from '../controller/task.controller';

const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/create-task', createTaskHandler);
taskRouter.get('/get-task', getTaskByStatusIdHandler);
taskRouter.put('/update-task', updateTaskHandler);
taskRouter.delete('/delete-task/:id', deleteTaskHandler);

export default taskRouter;
