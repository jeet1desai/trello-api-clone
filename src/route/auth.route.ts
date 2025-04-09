import express from 'express';
const Authrouter = express.Router();
import authController from '../controller/auth.controller';
const { celebrate, Joi, errors, Segments } = require('celebrate');

import multer from 'multer';
const upload = multer();

const { Signup, Signin, RefreshToken, VerifyEmail } = authController;

Authrouter.route('/signup').post(upload.single('profile_image'), Signup);
Authrouter.route('/signin').post(Signin);
Authrouter.route('/refresh-token').post(RefreshToken);
Authrouter.route('/verify-email').post(VerifyEmail);

export default Authrouter;
