import express from 'express';
import Joi from 'joi';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { BoardInviteModel } from '../model/boardInvite.model';
import { validateRequest } from '../utils/validation.utils';
import { sendInvitationSchema, updateInvitationSchema } from '../schemas/board.schema';
import { MEMBER_INVITE_STATUS, MEMBER_ROLES } from '../config/app.config';
import User from '../model/user.model';
import { MemberModel } from '../model/members.model';
import { BoardModel } from '../model/board.model';
import { WorkSpaceModel } from '../model/workspace.model';
import { sendBoardInviteEmail } from './board.controller';
import { NotificationModel } from '../model/notification.model';
import { getSocket, users } from '../config/socketio.config';
import { emitToUser } from '../utils/socket';

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
  const { io } = getSocket();

  try {
    await validateRequest(req.body, updateInvitationSchema);

    // @ts-expect-error
    const user = req.user;
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

    const notification = await NotificationModel.create({
      message: `${user.first_name} ${user.last_name} have ${status === MEMBER_INVITE_STATUS.COMPLETED ? 'accepted' : 'rejected'} the invitation to join the board`,
      action: 'invitation',
      receiver: invitation.invitedBy,
      sender: user._id,
    });

    emitToUser(io, invitation.invitedBy?.toString(), 'receive_notification', { data: notification });

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

export const sendInvitationDetailController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await validateRequest(req.body, sendInvitationSchema);

    // @ts-expect-error
    const user = req.user;

    const { id } = req.params;
    const { members } = req.body;

    const board = await BoardModel.findById(id);

    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }

    const workspace = await WorkSpaceModel.findById(board.workspaceId);
    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    if (members && members.length > 0) {
      for (const email of members) {
        if (email === user.email) continue;

        const existingUser = await User.findOne({ email });

        const isAlreadyMember = existingUser
          ? await MemberModel.exists({
              memberId: existingUser._id,
              boardId: board._id,
              workspaceId: workspace._id,
            })
          : false;

        if (isAlreadyMember) continue;

        const existingInvite = await BoardInviteModel.findOne({
          email,
          boardId: board._id,
          invitedBy: user._id,
          workspaceId: workspace._id,
        });

        // If status is COMPLETED → Skip
        if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.COMPLETED) {
          continue;
        }

        // If status is REJECTED → Update to PENDING and send email
        if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.REJECTED) {
          existingInvite.status = MEMBER_INVITE_STATUS.PENDING;
          await existingInvite.save();
          await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: existingInvite._id.toString() });
          continue;
        }

        // If status is PENDING → Send email
        if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.PENDING) {
          await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: existingInvite._id.toString() });
          continue;
        }

        // No invite exists → Create one and send email
        const newInvite = await BoardInviteModel.create({
          email,
          role: MEMBER_ROLES.MEMBER,
          boardId: board._id,
          invitedBy: user._id,
          workspaceId: workspace._id,
          status: MEMBER_INVITE_STATUS.PENDING,
        });

        await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: newInvite._id.toString() });
      }
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Invitation successfully sent', req.body);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
