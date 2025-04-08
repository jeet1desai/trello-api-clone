import express from 'express';
import { validateCreateWorkspace } from '../validators/workspace';
import { createWorkSpaceController } from '../controller/workspace.controller';

const router = express.Router();

router.post('/create-workspace', validateCreateWorkspace, createWorkSpaceController);

export default router;
