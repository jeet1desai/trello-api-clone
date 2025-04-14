import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getNotificationListController } from '../controller/notification.controller';

const router = express.Router();

router.use(userMiddleware);
router.get('/notification-list', getNotificationListController);

export default router;
