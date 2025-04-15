import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { addCommentHandler, getCommentHandler, deleteCommentHandler, updateCommentHandler } from '../controller/comment.controller';

const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/add', addCommentHandler);
taskRouter.delete('/delete/:id', deleteCommentHandler);
taskRouter.get('/get/:taskId', getCommentHandler);
taskRouter.put('/update/:id', updateCommentHandler);

export default taskRouter;
