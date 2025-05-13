import express from 'express';
const authRouter = express.Router();
import authController from '../controller/auth.controller';
import userMiddleware from '../middleware/user.middleware';
import multer from 'multer';
const upload = multer();

const { Signup, Signin, RefreshToken, VerifyEmail, ForgotPassword, ChangePassword, ResetPassword, logoutHandler, firebaseSocialLogin } =
  authController;

authRouter.route('/signup').post(upload.single('profile_image'), Signup);
authRouter.route('/signin').post(Signin);
authRouter.route('/social-firebase-login').post(firebaseSocialLogin);
authRouter.route('/refresh-token').post(RefreshToken);
authRouter.route('/verify-email').post(VerifyEmail);
authRouter.route('/forgot-password').post(ForgotPassword);
authRouter.route('/change-password').post(ChangePassword);
authRouter.route('/reset-password').post(userMiddleware, ResetPassword);
authRouter.route('/logout').get(logoutHandler);

export default authRouter;
