import express from 'express';
import Joi from 'joi';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { BoardInviteModel, BoardInviteModelType } from '../model/boardInvite.model';
import { validateRequest } from '../utils/validation.utils';
import { sendInvitationSchema, updateInvitationSchema } from '../schemas/board.schema';
import { MEMBER_INVITE_STATUS, MEMBER_ROLES, SORT_TYPE } from '../config/app.config';
import User from '../model/user.model';
import { MemberModel } from '../model/members.model';
import { BoardModel } from '../model/board.model';
import { WorkSpaceModel } from '../model/workspace.model';
import { sendBoardInviteEmail } from './board.controller';
import { NotificationModel } from '../model/notification.model';
import { getSocket } from '../config/socketio.config';
import { emitToUser } from '../utils/socket';
import { saveRecentActivity } from '../helper/recentActivityService';
import { getPagination } from '../utils/pagination';
import { Document, Schema, Types } from 'mongoose';

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
}

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

    const invitation = await BoardInviteModel.findOne({
      _id: id,
      status: { $in: [MEMBER_INVITE_STATUS.PENDING, MEMBER_INVITE_STATUS.ADMIN_APPROVED] },
    });
    if (!invitation) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Invitation not found');
      return;
    }

    const existingUser = await User.findOne({ email: invitation.email, status: true });
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
        await saveRecentActivity(
          existingUser._id.toString(),
          'Joined',
          'Board',
          invitation.boardId.toString(),
          [user._id.toString(), invitation?.invitedBy],
          `${existingUser.first_name} joined the board via invitation`
        );
      }
    }

    if (status === MEMBER_INVITE_STATUS.REJECTED) {
      await saveRecentActivity(
        existingUser._id.toString(),
        'Rejected',
        'Board',
        invitation.boardId.toString(),
        [invitation?.invitedBy as unknown as string],
        `${existingUser.first_name} rejected the invitation to join the board`
      );
    }

    const notification = await NotificationModel.create({
      message: `${user.first_name} ${user.last_name} have ${status === MEMBER_INVITE_STATUS.COMPLETED ? 'accepted' : 'rejected'} the invitation to join the board`,
      action: 'invitation',
      receiver: invitation.invitedBy,
      sender: user,
    });

    emitToUser(io, invitation.invitedBy?.toString(), 'receive_notification', { data: notification });

    invitation.status = status;
    const updatedInvitation = await invitation.save();

    const invitationNew = await MemberModel.find({ boardId: invitation.boardId })
      .populate('boardId', 'name')
      .populate('workspaceId', 'name')
      .populate('memberId', 'first_name last_name email');

    if (io) {
      io.to(invitation?.boardId?.toString() ?? '').emit('receive_new_member', {
        data: invitationNew,
      });
    }

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

    const invitedBy: any = await MemberModel.findOne({
      boardId: board._id,
      workspaceId: workspace._id,
      memberId: user._id,
    });

    let skippedEmails: string[] = [];

    let memberEmails: string[] = [];

    if (members && members.length > 0) {
      const invitePromises = members
        .filter((email: string) => email !== user.email)
        .map(async (email: string) => {
          const existingUser = await User.findOne({ email });

          const isAlreadyMember = existingUser
            ? await MemberModel.exists({
                memberId: existingUser._id,
                boardId: board._id,
                workspaceId: workspace._id,
              })
            : false;

          if (isAlreadyMember) {
            memberEmails.push(email);
            return;
          }

          const existingInvite = await BoardInviteModel.findOne({
            email,
            boardId: board._id,
            workspaceId: workspace._id,
          });

          const isAdmin = invitedBy.role === 'ADMIN';

          // If COMPLETED, skip with early return
          if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.COMPLETED) {
            skippedEmails.push(email);
            return;
          }

          // If REJECTED → Update to PENDING/ADMIN_PENDING
          if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.REJECTED) {
            existingInvite.status = isAdmin ? MEMBER_INVITE_STATUS.PENDING : MEMBER_INVITE_STATUS.ADMIN_PENDING;
            existingInvite.invitedBy = user._id;
            await existingInvite.save();

            if (isAdmin) {
              await sendBoardInviteEmail({
                user,
                email,
                existingUser,
                board,
                workspace,
                inviteId: existingInvite._id.toString(),
              });
            }
            return;
          }

          // If already PENDING → send email if admin
          if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.PENDING) {
            if (isAdmin) {
              await sendBoardInviteEmail({
                user,
                email,
                existingUser,
                board,
                workspace,
                inviteId: existingInvite._id.toString(),
              });
            }
            return;
          }

          // No invite exists → create new
          const newInvite = await BoardInviteModel.create({
            email,
            role: MEMBER_ROLES.MEMBER,
            boardId: board._id,
            invitedBy: user._id,
            workspaceId: workspace._id,
            status: isAdmin ? MEMBER_INVITE_STATUS.PENDING : MEMBER_INVITE_STATUS.ADMIN_PENDING,
            is_approved_by_admin: isAdmin ? false : true,
          });

          if (isAdmin) {
            await sendBoardInviteEmail({
              user,
              email,
              existingUser,
              board,
              workspace,
              inviteId: newInvite._id.toString(),
            });
          }
        });

      await Promise.all(invitePromises);
    }
    let message = '';

    const successfulInvites = members.length - skippedEmails.length - memberEmails.length;

    if (successfulInvites > 0) {
      message += invitedBy.role === 'ADMIN' ? 'Invitations were successfully sent. ' : 'Your invitations have been sent to the admin for approval. ';
    }

    if (skippedEmails.length > 0) {
      message += `The following users are already invited: ${skippedEmails.join(', ')}. `;
    }

    if (memberEmails.length > 0) {
      message += `The following users are already in the board: ${memberEmails.join(', ')}.`;
    }

    APIResponse(res, true, HttpStatusCode.OK, message, req.body);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getInvitationListController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;

    const { page = '1', perPage = '10', search = '', sortType = SORT_TYPE.CreatedDateDesc, status = 'ALL', boardId } = req.query || {};

    const {
      skip,
      limit,
      page: currentPage,
    } = getPagination({
      page: page,
      limit: perPage,
    });

    const statusMap: Record<string, string[]> = {
      ALL: ['ADMIN_PENDING', 'ADMIN_APPROVED', 'ADMIN_REJECTED', 'COMPLETED'],
      APPROVED: ['ADMIN_APPROVED', 'COMPLETED'],
      PENDING: ['ADMIN_PENDING'],
      REJECTED: ['ADMIN_REJECTED'],
    };

    const boards = await BoardModel.find({ createdBy: user._id });
    const boardIds = boards.map((board) => board._id);

    const query: any = {
      boardId: { $in: boardIds },
      status: { $in: statusMap[status.toString().toUpperCase()] },
      is_approved_by_admin: true,
    };

    if (boardId) {
      query.boardId = boardId;
    }
    const [adminInvitesRaw, total] = await Promise.all([
      BoardInviteModel.find(query)
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'boardId',
          select: '_id name createdBy',
        })
        .populate({
          path: 'invitedBy',
          select: '_id email profilePicture createdBy first_name last_name',
        })
        .lean(), // Important for plain objects
      BoardInviteModel.countDocuments(query),
    ]);

    // Extract emails from invites
    const emails = adminInvitesRaw.map((invite) => invite.email);

    // Fetch user details by email
    const users: any = await User.find({ email: { $in: emails } })
      .select('email first_name last_name')
      .lean();

    // Build email-to-user map
    const userMap: Record<string, UserInfo> = users.reduce(
      (acc: any, user: any) => {
        acc[user.email] = user;
        return acc;
      },
      {} as Record<string, UserInfo>
    );

    // Final admin invites with `invitees`
    const adminInvites = adminInvitesRaw.map((invite: any) => {
      const user = userMap[invite.email];

      return {
        ...invite,
        invitees: user
          ? {
              email: user.email,
              fullName: `${user.first_name} ${user.last_name}`,
            }
          : {
              email: invite.email,
              fullName: 'No User Found',
            },
      };
    });

    const totalPages = Math.ceil(total / limit);

    APIResponse(res, true, HttpStatusCode.OK, 'Invitations successfully fetched', {
      data: adminInvites,
      pagination: {
        currentPage,
        totalPages: totalPages,
        totalRecords: total,
        limit,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateInvitationStatusController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { status, inviteId } = req.body;

  if (!Object.values(MEMBER_INVITE_STATUS).includes(status)) {
    APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid status');
    return;
  }

  try {
    // @ts-expect-error
    const user = req.user;

    const invitation = await BoardInviteModel.findById(inviteId);

    const board = await BoardModel.findById(invitation?.boardId);
    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }

    const workspace = await WorkSpaceModel.findById(board.workspaceId);
    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }
    if (!invitation) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Invite not found');
      return;
    }

    let notificationMessage = '';
    let updatedInvitation;

    if (invitation.status === MEMBER_INVITE_STATUS.ADMIN_APPROVED) {
      APIResponse(res, true, HttpStatusCode.CONFLICT, 'This Invitation is already Approved by Admin');
    } else if (status === MEMBER_INVITE_STATUS.ADMIN_APPROVED) {
      const existingUser = await User.findOne({ email: invitation.email });
      notificationMessage = 'The invitation has been approved by the admin. and send to mail user';
      updatedInvitation = await handleAdminApproval(invitation, status);
      await sendBoardInviteEmail({
        user,
        email: invitation.email ?? '',
        existingUser,
        board,
        workspace,
        inviteId: invitation._id.toString(),
      });
    } else if (status === MEMBER_INVITE_STATUS.ADMIN_REJECTED) {
      notificationMessage = 'The invitation has been rejected by the admin.';
      updatedInvitation = await handleAdminApproval(invitation, status);
    } else {
      updatedInvitation = await BoardInviteModel.findByIdAndUpdate(inviteId, { status }, { new: true });
    }

    if (!updatedInvitation) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Failed to update the invitation status');
      return;
    }

    await NotificationModel.create({
      message: notificationMessage,
      action: 'invitation',
      receiver: invitation.invitedBy,
      sender: user._id,
    });
    APIResponse(res, true, HttpStatusCode.OK, notificationMessage, updatedInvitation);
  } catch (error) {
    if (error instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, error.message);
    }
  }
};

const handleAdminApproval = async (
  invitation: Document<unknown, {}, BoardInviteModelType> & BoardInviteModelType & Required<{ _id: Schema.Types.ObjectId }> & { __v: number },
  status: MEMBER_INVITE_STATUS
) => {
  invitation.status = status;
  return await invitation.save();
};
