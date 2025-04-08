import express from 'express';
import { validateCreateWorkspace } from '../validators/workspace';
import {
  createWorkSpaceController,
  deleteWorkSpaceController,
  getWorkSpaceDetailController,
  updateWorkSpaceController,
} from '../controller/workspace.controller';
// import userMiddleware from '../middleware/user.middleware';

const router = express.Router();

// router.use(userMiddleware);
router.post('/create-workspace', validateCreateWorkspace, createWorkSpaceController);
router.put('/update-workspace/:id', updateWorkSpaceController);
router.delete('/delete-workspace/:id', deleteWorkSpaceController);
router.get('/get-workspace/:id', getWorkSpaceDetailController);

export default router;
