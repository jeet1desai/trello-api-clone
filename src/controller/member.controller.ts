import express from 'express';
import mongoose from 'mongoose';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode, TaskStatus } from '../helper/enum';
import { MemberModel } from '../model/members.model';
import { BoardModel } from '../model/board.model';
import { MEMBER_ROLES } from '../config/app.config';
import { BoardInviteModel } from '../model/boardInvite.model';
import User from '../model/user.model';
import { NotificationModel } from '../model/notification.model';
import { getSocket } from '../config/socketio.config';
import { emitToUser } from '../utils/socket';
import { TaskModel } from '../model/task.model';

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
        createdAt: 1,
        updatedAt: 1,
        __v: 1,
        role: 1,
        boardId: {
          _id: '$board._id',
          name: '$board.name',
        },
        workspaceId: {
          _id: '$workspace._id',
          name: '$workspace.name',
        },
        memberId: {
          _id: '$memberDetails._id',
          first_name: '$memberDetails.first_name',
          last_name: '$memberDetails.last_name',
          email: '$memberDetails.email',
        },
      },
    },
  ]);
};

export const leaveMemberController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await mongoose.startSession();
  const { io } = getSocket();
  const { bid } = req.params;
  // @ts-expect-error
  const user = req.user;

  if (!mongoose.Types.ObjectId.isValid(bid)) {
    APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid board ID');
    return;
  }

  try {
    session.startTransaction();

    const [board, member] = await Promise.all([
      BoardModel.findById(bid).session(session),
      MemberModel.findOne({ boardId: bid, memberId: user._id }).session(session),
    ]);

    if (!board) {
      await session.abortTransaction();
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found');
      return;
    }

    if (!member) {
      await session.abortTransaction();
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You are not a member of this board');
      return;
    }

    if (member.role === 'ADMIN') {
      const otherAdmins = await MemberModel.countDocuments({
        boardId: bid,
        role: 'ADMIN',
        memberId: { $ne: user._id },
      }).session(session);

      if (otherAdmins === 0) {
        await session.abortTransaction();
        APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'At least one admin must remain in the board');
        return;
      }
    }

    const pendingTasks = await TaskModel.exists({
      board_id: bid,
      assigned_to: user._id,
      status: TaskStatus.INCOMPLETE,
    }).session(session);

    if (pendingTasks) {
      await session.abortTransaction();
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You cannot leave the board until all your tasks are completed');
      return;
    }

    const [_, __, [notification]] = await Promise.all([
      MemberModel.deleteOne({ boardId: bid, memberId: user._id }, { session }),
      BoardInviteModel.deleteMany({ boardId: bid, email: user.email }, { session }),
      NotificationModel.create(
        [
          {
            message: `You have left the board "${board.name}"`,
            action: 'left',
            receiver: user,
            sender: user,
          },
        ],
        { session }
      ),
    ]);

    await session.commitTransaction();
    session.endSession();

    emitToUser(io, user._id.toString(), 'receive_notification', { data: notification });
    io?.to(bid.toString()).emit('remove_member', { data: member });

    APIResponse(res, true, HttpStatusCode.OK, 'You have left the board successfully', member);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err instanceof Error ? err.message : 'Unknown error');
  } finally {
    await session.endSession();
  }
};
