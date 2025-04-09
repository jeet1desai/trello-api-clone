import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { createBoardController } from '../controller/board.controller';

const router = express.Router();

router.use(userMiddleware);
router.post('/create-board', createBoardController);

export default router;
