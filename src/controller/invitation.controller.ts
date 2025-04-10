import express from 'express';
import Joi from 'joi';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { BoardInviteModel } from '../model/boardInvite.model';
import { validateRequest } from '../utils/validation.utils';
import { updateInvitationSchema } from '../schemas/board.schema';
import { MEMBER_INVITE_STATUS, MEMBER_ROLES } from '../config/app.config';
import User from '../model/user.model';
import { MemberModel } from '../model/members.model';

export const getInvitationDetailController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const invitation = await BoardInviteModel.findById(id)
      .populate('boardId', 'name')
      .populate('invitedBy', 'first_name last_name email')
      .populate('workspaceId', 'name');

    if (!invitation) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Invitation not found');
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Invitation successfully fetched', invitation);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateInvitationDetailController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await validateRequest(req.body, updateInvitationSchema);
    const { id } = req.params;
    const { status } = req.body;

    const invitation = await BoardInviteModel.findOne({ _id: id, status: MEMBER_INVITE_STATUS.PENDING });

    if (!invitation) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Invitation not found');
      return;
    }

    const existingUser = await User.findOne({ email: invitation.email });
    if (!existingUser) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'User not found for the given invitation');
      return;
    }

    if (status === MEMBER_INVITE_STATUS.COMPLETED) {
      const existingMember = await MemberModel.findOne({
        memberId: existingUser._id,
        boardId: invitation.boardId,
        workspaceId: invitation.workspaceId,
      });

      if (!existingMember) {
        await MemberModel.create({
          memberId: existingUser._id,
          boardId: invitation.boardId,
          workspaceId: invitation.workspaceId,
          role: invitation.role || MEMBER_ROLES.MEMBER,
        });
      }
    }

    invitation.status = status;
    const updatedInvitation = await invitation.save();

    APIResponse(res, true, HttpStatusCode.OK, 'Invitation successfully updated', updatedInvitation);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
