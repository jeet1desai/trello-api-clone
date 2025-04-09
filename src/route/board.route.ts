import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { createBoardController, updateBoardController } from '../controller/board.controller';

const router = express.Router();

router.use(userMiddleware);
router.post('/create-board', createBoardController);
router.put('/update-board/:id', updateBoardController);

export default router;
