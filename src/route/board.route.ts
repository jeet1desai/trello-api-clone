import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import {
  createBoardController,
  deleteBoardController,
  getBoardController,
  getBoardsController,
  getWorkspaceBoardsController,
  updateBoardController,
  updateFavoriteStatus,
  boardBackgrounds,
  updateBoardBackground,
  getBoardAnalytics,
} from '../controller/board.controller';

const router = express.Router();

router.use(userMiddleware);
router.post('/create-board', createBoardController);
router.put('/update-board/:id', updateBoardController);
router.delete('/delete-board/:id', deleteBoardController);
router.get('/get-board/:id', getBoardController);
router.get('/get-boards-list/:id', getWorkspaceBoardsController);
router.get('/get-boards', getBoardsController);
router.put('/favorite/:boardId', updateFavoriteStatus);
router.get('/backgrounds', boardBackgrounds);
router.put('/update-background', updateBoardBackground);
router.get('/analytics/:boardId', getBoardAnalytics);

export default router;
