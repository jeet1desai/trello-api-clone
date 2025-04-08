import express from 'express';
const router = express.Router();
import authController from '../controller/auth.controller';
import multer from 'multer';
const upload = multer();

const { Signup } = authController;

router.post('/signup', upload.single('profile_image'), Signup);

export default router;
