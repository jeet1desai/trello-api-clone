import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getNotificationListController, markNotificationAsReadController } from '../controller/notification.controller';

const router = express.Router();

router.use(userMiddleware);
router.get('/notification-list', getNotificationListController);
router.put('/mark-notification/:id', markNotificationAsReadController);

export default router;
