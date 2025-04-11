import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { createLabelHandler, deleteLabelHandler, getLabelsByBoardHandler, updateLabelHandler } from '../controller/label.controller';

const labelRouter = express.Router();

labelRouter.use(userMiddleware);
labelRouter.post('/create-label', createLabelHandler);
labelRouter.put('/update-label/:id', updateLabelHandler);
labelRouter.delete('/delete-label/:id', deleteLabelHandler);
labelRouter.get('/get-labels/:id', getLabelsByBoardHandler);

export default labelRouter;
