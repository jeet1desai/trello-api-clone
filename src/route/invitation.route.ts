import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import { getInvitationDetailController, updateInvitationDetailController } from '../controller/invitation.controller';

const router = express.Router();

router.use(userMiddleware);
router.get('/invite-details/:id', getInvitationDetailController);
router.put('/update-invitation/:id', updateInvitationDetailController);

export default router;
