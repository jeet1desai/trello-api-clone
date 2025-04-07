import express from 'express';
const router = express.Router();
import testRouter from './test.route';

router.use('/test', testRouter);

export default router;
