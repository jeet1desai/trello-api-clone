import express from 'express';
const authRouter = express.Router();
import authController from '../controller/auth.controller';
const { celebrate, Joi, errors, Segments } = require('celebrate');

import multer from 'multer';
const upload = multer();

const { Signup, Signin, RefreshToken } = authController;

authRouter.route('/signup').post(upload.single('profile_image'), Signup);
authRouter.route('/signin').post(Signin);
authRouter.route('/refresh-token').post(RefreshToken);

export default authRouter;
