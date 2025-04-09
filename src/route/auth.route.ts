import express from 'express';
const authRouter = express.Router();
import authController from '../controller/auth.controller';

import multer from 'multer';
const upload = multer();

const { Signup, Signin, RefreshToken, VerifyEmail } = authController;

authRouter.route('/signup').post(upload.single('profile_image'), Signup);
authRouter.route('/signin').post(Signin);
authRouter.route('/refresh-token').post(RefreshToken);
authRouter.route('/verify-email').post(VerifyEmail);

export default authRouter;
