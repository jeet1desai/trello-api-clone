import express from 'express';
const router = express.Router();
import authRouter from './auth.route';

router.use('/auth', authRouter);

export default router;
