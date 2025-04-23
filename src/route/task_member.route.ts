import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { addTaskMemberHandler, deleteTaskMemberHandler, getTaskMemberHandler } from '../controller/taskmember.controller';

const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/add-member', addTaskMemberHandler);
taskRouter.delete('/delete-member', deleteTaskMemberHandler);
taskRouter.get('/get-task-member/:taskId', getTaskMemberHandler);

export default taskRouter;
