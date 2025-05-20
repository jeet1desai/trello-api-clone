import express from 'express';
import {
  createWorkSpaceController,
  deleteWorkSpaceController,
  getAllWorkSpaceController,
  getWorkSpaceDetailController,
  updateWorkSpaceController,
  updateWorkSpaceFavoriteController,
} from '../controller/workspace.controller';
import userMiddleware from '../middleware/user.middleware';

const router = express.Router();

router.use(userMiddleware);
router.post('/create-workspace', createWorkSpaceController);
router.put('/update-workspace/:id', updateWorkSpaceController);
router.delete('/delete-workspace/:id', deleteWorkSpaceController);
router.get('/get-workspace/:id', getWorkSpaceDetailController);
router.get('/get-workspaces', getAllWorkSpaceController);
router.put('/favorite/:id', updateWorkSpaceFavoriteController);

export default router;
