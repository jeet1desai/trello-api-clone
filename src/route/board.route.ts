import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import {
  createBoardController,
  deleteBoardController,
  getBoardController,
  getBoardsController,
  getWorkspaceBoardsController,
  updateBoardController,
} from '../controller/board.controller';

const router = express.Router();

router.use(userMiddleware);
router.post('/create-board', createBoardController);
router.put('/update-board/:id', updateBoardController);
router.delete('/delete-board/:id', deleteBoardController);
router.get('/get-board/:id', getBoardController);
router.get('/get-boards-list/:id', getWorkspaceBoardsController);
router.get('/get-boards', getBoardsController);

export default router;
