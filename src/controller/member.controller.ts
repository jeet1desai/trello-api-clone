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
import { getSocket } from '../config/socketio.config';
import { emitToUser } from '../utils/socket';

export const getMemberListController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const { search = '' } = req.query;

    const members = await getBoardMembersBySearch(id, search as string);

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
          sender: user,
        },
      ],
      { session }
    );

    emitToUser(io, uid, 'receive_notification', { data: notification });

    if (io) {
      io.to(bid?.toString() ?? '').emit('remove_member', {
        data: targetMember,
      });
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

const getBoardMembersBySearch = async (boardId: string, search: string = '') => {
  return MemberModel.aggregate([
    { $match: { boardId: new mongoose.Types.ObjectId(boardId) } },
    {
      $lookup: {
        from: 'users',
        localField: 'memberId',
        foreignField: '_id',
        as: 'memberDetails',
      },
    },
    { $unwind: '$memberDetails' },
    {
      $match: {
        $or: [
          { 'memberDetails.first_name': { $regex: search, $options: 'i' } },
          { 'memberDetails.last_name': { $regex: search, $options: 'i' } },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ['$memberDetails.first_name', ' ', '$memberDetails.last_name'] },
                regex: search,
                options: 'i',
              },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: 'boards',
        localField: 'boardId',
        foreignField: '_id',
        as: 'board',
      },
    },
    { $unwind: '$board' },
    {
      $lookup: {
        from: 'workspaces',
        localField: 'workspaceId',
        foreignField: '_id',
        as: 'workspace',
      },
    },
    { $unwind: '$workspace' },
    {
      $project: {
        _id: 1,
        boardId: '$board._id',
        boardName: '$board.name',
        workspaceId: '$workspace._id',
        workspaceName: '$workspace.name',
        member: {
          _id: '$memberDetails._id',
          first_name: '$memberDetails.first_name',
          last_name: '$memberDetails.last_name',
          email: '$memberDetails.email',
        },
      },
    },
  ]);
};
