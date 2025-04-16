import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { addCommentHandler, getCommentHandler, deleteCommentHandler, updateCommentHandler } from '../controller/comment.controller';
import multer from 'multer';
const upload = multer();
const taskRouter = express.Router();

taskRouter.use(userMiddleware);
taskRouter.post('/add', upload.array('attachment', 10), addCommentHandler);
taskRouter.delete('/delete/:id', deleteCommentHandler);
taskRouter.get('/get/:taskId', getCommentHandler);
taskRouter.put('/update/:id', upload.array('attachment', 10), updateCommentHandler);

export default taskRouter;
