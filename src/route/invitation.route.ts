import express from 'express';
import userMiddleware from '../middleware/user.middleware';
import {
  getInvitationDetailController,
  updateInvitationDetailController,
  sendInvitationDetailController,
  getInvitationListController,
  updateInvitationStatusController,
} from '../controller/invitation.controller';

const router = express.Router();

router.use(userMiddleware);
router.get('/invite-details/:id', getInvitationDetailController);
router.put('/update-invitation/:id', updateInvitationDetailController);
router.post('/send-invitation/:id', sendInvitationDetailController);

router.get('/admin-invite-details', getInvitationListController);
router.patch('/admin-update-invite-status', updateInvitationStatusController);

export default router;
