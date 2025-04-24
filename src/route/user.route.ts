import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getUserProfileHandler, updateUserProfileHandler } from '../controller/user.controller';
import multer from 'multer';
import { getUserRecentActivitiesHandler } from '../controller/recentactivity.controller';
const upload = multer();

const userRouter = express.Router();

userRouter.use(userMiddleware);
userRouter.get('/profile', getUserProfileHandler);
userRouter.put('/profile', upload.single('profile_image'), updateUserProfileHandler);
userRouter.get('/activity', getUserRecentActivitiesHandler);

export default userRouter;
