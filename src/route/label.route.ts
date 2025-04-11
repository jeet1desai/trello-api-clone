import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { createLabelHandler } from '../controller/label.controller';

const labelRouter = express.Router();

labelRouter.use(userMiddleware);
labelRouter.post('/create-label', createLabelHandler);

export default labelRouter;
