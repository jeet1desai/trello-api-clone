import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getDashboardCardCountHandler } from '../controller/dashboard.controller';
const dashboardRouter = express.Router();

dashboardRouter.use(userMiddleware);
dashboardRouter.get('/count', getDashboardCardCountHandler);

export default dashboardRouter;
