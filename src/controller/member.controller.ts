import express from 'express';
import mongoose from 'mongoose';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { MemberModel } from '../model/members.model';
import { BoardModel } from '../model/board.model';
import { MEMBER_ROLES } from '../config/app.config';
import { BoardInviteModel } from '../model/boardInvite.model';
import User from '../model/user.model';
import { NotificationModel } from '../model/notification.model';
import { getSocket, users } from '../config/socketio.config';

export const getMemberListController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const members = await MemberModel.find({ boardId: id })
      .populate('boardId', 'name')
      .populate('workspaceId', 'name')
      .populate('memberId', 'first_name last_name email');

    APIResponse(res, true, HttpStatusCode.OK, 'Members successfully fetched', members);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const removeMemberController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const { io } = getSocket();

  try {
    // @ts-expect-error
    const user = req.user;
    const { bid, uid } = req.params;

    if (user._id.toString() === uid) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You cannot remove yourself');
      return;
    }

    const deletedUser = await User.findById(uid);
    if (!deletedUser) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'User not found');
      return;
    }

    const board = await BoardModel.findById(bid);
    if (!board) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found');
      return;
    }

    // Check if the requesting user is an admin on the board
    const requestingMember = await MemberModel.findOne({ boardId: bid, memberId: user._id });
    if (!requestingMember || requestingMember.role !== MEMBER_ROLES.ADMIN) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You do not have permission to remove members');
      return;
    }

    // Check if the target user is a member of the board
    const targetMember = await MemberModel.findOne({
      boardId: bid,
      memberId: uid,
    });
    if (!targetMember) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'User is not a member of the board');
      return;
    }

    await MemberModel.deleteOne({ boardId: bid, memberId: uid }, { session });
    await BoardInviteModel.deleteMany({ boardId: bid, email: deletedUser.email }, { session });

    const [notification] = await NotificationModel.create(
      [
        {
          message: `You have been removed from board "${board.name}"`,
          action: 'removed',
          receiver: uid,
          sender: user._id,
        },
      ],
      { session }
    );

    const socketId = users.get(uid);
    if (socketId) {
      io?.to(socketId).emit('receive_notification', { data: notification });
    } else {
      console.warn(`No socket connection found for user: ${uid}`);
    }

    await session.commitTransaction();
    session.endSession();

    APIResponse(res, true, HttpStatusCode.OK, 'Members removed successfully', targetMember);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
