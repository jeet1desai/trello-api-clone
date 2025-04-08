import express from 'express';
const router = express.Router();

import workspaceRouter from './workspace.route';
import authRouter from './auth.route';

router.use('/auth', authRouter);
router.use('/workspace', workspaceRouter);

export default router;
