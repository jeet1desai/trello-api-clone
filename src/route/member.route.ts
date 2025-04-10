import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getMemberListController, removeMemberController } from '../controller/member.controller';

const router = express.Router();

router.use(userMiddleware);
router.get('/member-list/:id', getMemberListController);
router.delete('/remove-member/:bid/:uid', removeMemberController);

export default router;
