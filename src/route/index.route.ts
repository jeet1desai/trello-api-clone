import express from 'express';
const router = express.Router();
import testRouter from './test.route';
import authRouter from './auth.route';

router.use('/test', testRouter);
router.use('/auth', authRouter);

export default router;
