import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getNotificationListController, markNotificationAsReadController, markAllNotificationsAsReadController } from '../controller/notification.controller';

const router = express.Router();

router.use(userMiddleware);
router.get('/notification-list', getNotificationListController);
router.put('/mark-notification/:id', markNotificationAsReadController);
router.put('/mark-all-notifications-read', markAllNotificationsAsReadController);

export default router;
