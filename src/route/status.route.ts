import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { createStatusHandler, deleteStatusHandler, getStatusByBoardIdHandler, updateStatusHandler } from '../controller/status.controller';

const statusRouter = express.Router();

statusRouter.use(userMiddleware);
statusRouter.post('/create-status', createStatusHandler);
statusRouter.get('/get-status', getStatusByBoardIdHandler);
statusRouter.put('/update-status', updateStatusHandler);
statusRouter.delete('/delete-status/:id', deleteStatusHandler);

export default statusRouter;
