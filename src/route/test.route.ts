import express from 'express';
const router = express.Router();
import testController from '../controller/test.controller';

const { GetTestData } = testController;

router.get('/get', GetTestData);

export default router;
