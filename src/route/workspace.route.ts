import express from 'express';
import {
  createWorkSpaceController,
  deleteWorkSpaceController,
  getWorkSpaceDetailController,
  updateWorkSpaceController,
} from '../controller/workspace.controller';
import userMiddleware from '../middleware/user.middleware';

const router = express.Router();

router.use(userMiddleware);
router.post('/create-workspace', createWorkSpaceController);
router.put('/update-workspace/:id', updateWorkSpaceController);
router.delete('/delete-workspace/:id', deleteWorkSpaceController);
router.get('/get-workspace/:id', getWorkSpaceDetailController);

export default router;
