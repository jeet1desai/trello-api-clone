import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import {
  addTaskMemberHandler,
  assignTaskMemberHandler,
  deleteTaskMemberHandler,
  getTaskMemberHandler,
  unassignTaskMemberHandler,
} from '../controller/taskmember.controller';

const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/add-member', addTaskMemberHandler);
taskRouter.post('/assign-member', assignTaskMemberHandler);
taskRouter.delete('/unassign-member', unassignTaskMemberHandler);
taskRouter.delete('/delete-member', deleteTaskMemberHandler);
taskRouter.get('/get-task-member/:taskId', getTaskMemberHandler);

export default taskRouter;
