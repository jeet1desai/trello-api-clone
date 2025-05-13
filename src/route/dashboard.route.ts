import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getAnalyticHandler, getDashboardCardCountHandler } from '../controller/dashboard.controller';
const dashboardRouter = express.Router();

dashboardRouter.use(userMiddleware);
dashboardRouter.get('/count', getDashboardCardCountHandler);
dashboardRouter.get('/analytic', getAnalyticHandler);

export default dashboardRouter;
