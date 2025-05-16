import express from 'express';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createBoardSchema } from '../schemas/board.schema';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import mongoose, { PipelineStage } from 'mongoose';
import { BoardModel } from '../model/board.model';
import { convertObjectId, getSortOption, MEMBER_INVITE_STATUS, MEMBER_ROLES, SORT_TYPE } from '../config/app.config';
import { WorkSpaceModel } from '../model/workspace.model';
import { MemberModel } from '../model/members.model';
import User from '../model/user.model';
import { BoardInviteModel } from '../model/boardInvite.model';
import { sendEmail } from '../utils/sendEmail';
import ejs from 'ejs';
import { getSocket } from '../config/socketio.config';
import { NotificationModel } from '../model/notification.model';
import { emitToUser } from '../utils/socket';
import { saveRecentActivity } from '../helper/recentActivityService';
import { getPagination } from '../utils/pagination';
import { StatusModel } from '../model/status.model';
import { TaskModel } from '../model/task.model';
import { TaskLabelModel } from '../model/taskLabel.model';
import { TaskMemberModel } from '../model/taskMember.model';

export const createBoardController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const { io } = getSocket();

  try {
    await validateRequest(req.body, createBoardSchema);

    // @ts-expect-error
    const user = req.user;
    const { workspace, name, description, members } = req.body;

    const workspaceDetails = await WorkSpaceModel.findById({ _id: workspace });
    if (!workspaceDetails) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    const [board] = await BoardModel.create(
      [
        {
          name,
          description,
          workspaceId: convertObjectId(workspace.toString()),
          createdBy: convertObjectId(user._id.toString()),
        },
      ],
      { session }
    );

    await MemberModel.create(
      [
        {
          memberId: convertObjectId(user._id.toString()),
          role: MEMBER_ROLES.ADMIN,
          boardId: convertObjectId(board?._id.toString()),
          workspaceId: convertObjectId(workspace),
        },
      ],
      { session }
    );

    let visibleUserIds = [user._id.toString()];

    if (members && members.length > 0) {
      for (const email of members) {
        if (email === user.email) continue;

        const existingUser = await User.findOne({ email });

        const [invite] = await BoardInviteModel.create(
          [
            {
              email,
              role: MEMBER_ROLES.MEMBER,
              boardId: board._id,
              invitedBy: user._id,
              workspaceId: convertObjectId(workspace.toString()),
              status: MEMBER_INVITE_STATUS.PENDING,
            },
          ],
          { session }
        );

        if (existingUser) {
          visibleUserIds.push(existingUser._id.toString());
          const notification = await NotificationModel.create({
            message: `You have been invited to board "${name}"`,
            action: 'invited',
            receiver: convertObjectId(existingUser._id.toString()),
            sender: user,
          });

          emitToUser(io, existingUser._id.toString(), 'receive_notification', { data: notification });
        }

        await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: invite._id.toString() });
      }
    }

    await saveRecentActivity(
      user?._id,
      'Created',
      'Board',
      board?._id.toString(),
      visibleUserIds,
      `Board "${board.name}" was created by ${user.first_name}`
    );

    await session.commitTransaction();
    session.endSession();

    APIResponse(res, true, HttpStatusCode.CREATED, 'Board successfully created', board);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateBoardController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { io } = getSocket();

  try {
    // @ts-expect-error
    const user = req.user;
    const { id } = req.params;
    const { name, description, members } = req.body;

    let board: any = await BoardModel.findById({ _id: id });

    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }

    if (board.createdBy.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to perform this task');
      return;
    }

    const workspace = await WorkSpaceModel.findById(board.workspaceId);
    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }
    board = await BoardModel.findByIdAndUpdate({ _id: id }, { name, description }, { runValidators: true, returnDocument: 'after' });
    const boardMembers = await MemberModel.find({ boardId: board._id }).select('memberId');
    let visibleUserIds = new Set([user._id.toString()]);

    for (const member of boardMembers as any) {
      visibleUserIds.add(member?.memberId.toString());
    }

    if (members && members.length > 0) {
      for (const email of members) {
        if (email === user.email) continue;

        const existingUser = await User.findOne({ email });
        const isAlreadyMember = existingUser
          ? await MemberModel.exists({
              memberId: convertObjectId(existingUser._id.toString()),
              boardId: convertObjectId(board._id.toString()),
              workspaceId: convertObjectId(workspace._id.toString()),
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

          const notification = await NotificationModel.create({
            message: `You have been invited to board "${name}" again`,
            action: 'invited',
            receiver: convertObjectId(existingUser._id.toString()),
            sender: user,
          });

          emitToUser(io, existingUser._id.toString(), 'receive_notification', { data: notification });

          await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: existingInvite._id.toString() });
          continue;
        }

        // If status is PENDING → Send email
        if (existingInvite && existingInvite.status === MEMBER_INVITE_STATUS.PENDING) {
          const notification = await NotificationModel.create({
            message: `You have been invited to board "${name}"`,
            action: 'invited',
            receiver: convertObjectId(existingUser._id.toString()),
            sender: user,
          });

          emitToUser(io, existingUser._id.toString(), 'receive_notification', { data: notification });

          await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: existingInvite._id.toString() });
          continue;
        }

        // No invite exists → Create one and send email
        const newInvite = await BoardInviteModel.create({
          email,
          role: MEMBER_ROLES.MEMBER,
          boardId: convertObjectId(board._id.toString()),
          invitedBy: convertObjectId(user._id.toString()),
          workspaceId: convertObjectId(workspace._id.toString()),
          status: MEMBER_INVITE_STATUS.PENDING,
        });

        if (existingUser) {
          visibleUserIds.add(existingUser._id.toString());
          const notification = await NotificationModel.create({
            message: `You have been invited to board "${name}"`,
            action: 'invited',
            receiver: convertObjectId(existingUser._id.toString()),
            sender: user,
          });

          emitToUser(io, existingUser._id.toString(), 'receive_notification', { data: notification });
        }

        await sendBoardInviteEmail({ user, email, existingUser, board, workspace, inviteId: newInvite._id.toString() });
      }
    }

    await saveRecentActivity(
      user?._id,
      'Updated',
      'Board',
      board?._id.toString(),
      Array.from(visibleUserIds),
      `Board "${board.name}" was updated by ${user.first_name}`
    );

    APIResponse(res, true, HttpStatusCode.OK, 'Board successfully updated', board);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const deleteBoardController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const { io } = getSocket();

  try {
    // @ts-expect-error
    const user = req.user;
    const { id } = req.params;

    const board = await BoardModel.findById({ _id: id });
    if (!board) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }
    if (board?.createdBy?.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to perform this task');
      return;
    }

    const requestingMember = await MemberModel.findOne({ boardId: id, memberId: user._id });
    if (!requestingMember || requestingMember.role !== MEMBER_ROLES.ADMIN) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You do not have permission to delete board');
      return;
    }

    const membersToNotify = await MemberModel.find({ boardId: id, memberId: { $ne: user._id } }).populate('memberId');

    const tasks = await TaskModel.find({ board_id: id }, '_id', { session });
    const taskIds = tasks.map((task) => task._id);

    await Promise.all([
      BoardModel.deleteOne({ _id: id }, { session }),
      MemberModel.deleteMany({ boardId: id }, { session }),
      BoardInviteModel.deleteMany({ boardId: id }, { session }),
      StatusModel.deleteMany({ board_id: id }, { session }),
      TaskModel.deleteMany({ board_id: id }, { session }),
      TaskLabelModel.deleteMany({ task_id: { $in: taskIds } }, { session }),
      TaskMemberModel.deleteMany({ task_id: { $in: taskIds } }, { session }),
    ]);

    let visibleUserIds = [user._id.toString()];

    for (const member of membersToNotify) {
      const userToNotify: any = member.memberId;
      visibleUserIds.push(userToNotify._id?.toString());
      const [notification] = await NotificationModel.create(
        [
          {
            message: `Board "${board.name}" is deleted by admin and you have been removed from board`,
            action: 'removed',
            receiver: userToNotify,
            sender: user,
          },
        ],
        { session }
      );
      emitToUser(io, userToNotify?.toString(), 'receive_notification', { data: notification });
    }

    await saveRecentActivity(
      user?._id,
      'Deleted',
      'Board',
      board?._id.toString(),
      visibleUserIds,
      `Board "${board.name}" was deleted by ${user.first_name}`
    );
    await session.commitTransaction();
    session.endSession();

    APIResponse(res, true, HttpStatusCode.OK, 'Board successfully deleted', board);
  } catch (err) {
    console.error('Delete Board Error:', err);

    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getBoardController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;
    const { id } = req.params;

    const [board] = await BoardModel.aggregate(getBoardDetailsQuery(id));

    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }

    if (board?.members?.map((member: { memberId: any }) => member.memberId.toString()).includes(user._id?.toString())) {
      APIResponse(res, true, HttpStatusCode.OK, 'Board successfully fetched', board);
    } else {
      APIResponse(res, true, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to view this board');
    }
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

const getBoardDetailsQuery = (boardId: string): PipelineStage[] => {
  return [
    { $match: { $expr: { $eq: ['$_id', convertObjectId(boardId)] } } },
    {
      $lookup: {
        from: 'users',
        let: { memberId: '$createdBy' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$memberId'] } } },
          { $project: { _id: 1, first_name: 1, middle_name: 1, last_name: 1, email: 1 } },
        ],
        as: 'boardOwner',
      },
    },
    {
      $unwind: {
        path: '$boardOwner',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'members',
        let: { boardId: convertObjectId(boardId) },
        pipeline: [
          { $match: { $expr: { $eq: ['$boardId', '$$boardId'] } } },
          {
            $lookup: {
              from: 'users',
              let: { memberId: '$memberId' },
              pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$memberId'] } } }, { $project: { __v: 0, updatedAt: 0, password: 0 } }],
              as: 'user',
            },
          },
          {
            $unwind: {
              path: '$user',
              preserveNullAndEmptyArrays: true,
            },
          },
          { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
        ],
        as: 'members',
      },
    },
    {
      $lookup: {
        from: 'workspaces',
        let: { workspaceId: '$workspaceId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$workspaceId'] } } },
          {
            $lookup: {
              from: 'users',
              let: { creatorId: '$createdBy' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
                { $project: { _id: 1, first_name: 1, middle_name: 1, last_name: 1, email: 1 } },
              ],
              as: 'workspaceOwner',
            },
          },
          { $unwind: { path: '$workspaceOwner', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, name: 1, workspaceOwner: 1 } },
        ],
        as: 'workspace',
      },
    },
  ];
};

export const getWorkspaceBoardsController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    // @ts-expect-error
    const user = req.user;
    const boards = await BoardModel.aggregate(getWorkspaceBoardsQuery(id, user._id.toString()));

    APIResponse(res, true, HttpStatusCode.OK, 'Boards successfully fetched', boards);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getWorkspaceBoardsQuery = (workspaceId: string, userId: string): PipelineStage[] => {
  return [
    { $match: { $expr: { $eq: ['$workspaceId', convertObjectId(workspaceId)] } } },
    {
      $lookup: {
        from: 'members',
        let: { boardId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$boardId', '$$boardId'] }, { $eq: ['$memberId', convertObjectId(userId)] }, { $in: ['$role', ['MEMBER', 'ADMIN']] }],
              },
            },
          },
        ],
        as: 'membership',
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$membership' }, 0] } } },
    {
      $lookup: {
        from: 'members',
        let: { boardId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$boardId', '$$boardId'] }] } } },
          {
            $lookup: {
              from: 'users',
              let: { memberId: '$memberId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$memberId'] } } },
                { $project: { _id: 1, first_name: 1, middle_name: 1, last_name: 1, email: 1 } },
              ],
              as: 'user',
            },
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $project: { __v: 0, updatedAt: 0, createdAt: 0 } },
        ],
        as: 'members',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { memberId: '$createdBy' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$memberId'] } } },
          { $project: { _id: 1, first_name: 1, middle_name: 1, last_name: 1, email: 1 } },
        ],
        as: 'boardOwner',
      },
    },
    { $unwind: { path: '$boardOwner', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, name: 1, description: 1, boardOwner: 1, members: 1 } },
  ];
};

export const sendBoardInviteEmail = async ({
  user,
  email,
  existingUser,
  board,
  workspace,
  inviteId,
}: {
  user: any;
  email: string;
  existingUser?: any;
  board: any;
  workspace: any;
  inviteId: string;
}) => {
  const templatePath = __dirname + '/../helper/email-templates/board-invite.ejs';

  const html = await ejs.renderFile(templatePath, {
    inviteeName: existingUser ? `${existingUser.first_name} ${existingUser.last_name}` : '',
    inviterName: `${user.first_name} ${user.last_name}`,
    boardName: board.name,
    workspaceName: workspace.name,
    link: `${process.env.BOARD_FE_URL}/invitation/${inviteId}/${existingUser?._id}`,
    registerLink: `${process.env.BOARD_FE_URL}/register`,
  });

  const mailOptions = {
    to: email,
    subject: 'You are invited to join a board',
    html,
  };

  await sendEmail(mailOptions);
};

export const getBoardsController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;
    const { page = '1', perPage = '12', search = '', sortType = SORT_TYPE.CreatedDateDesc } = req.query || {};

    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(perPage) || 12;

    const {
      skip,
      limit,
      page: currentPage,
    } = getPagination({
      page: parsedPage,
      limit: parsedLimit,
    });
    // Get the sorting option based on sortType
    const sortOption = getSortOption(parseInt(sortType as string) || SORT_TYPE.CreatedDateDesc);

    // Create base pipeline
    const pipeline = getBoardListQuery(user._id.toString(), search as string, sortOption);

    // Paginated pipeline
    const paginatedPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

    // Execute paginated query
    const boards = await BoardModel.aggregate(paginatedPipeline);

    // Get total count for pagination (same filter logic but no skip/limit)
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await BoardModel.aggregate(countPipeline);
    const totalRecords = countResult[0]?.total || 0;

    // Send response
    APIResponse(res, true, HttpStatusCode.OK, 'Boards successfully fetched', {
      boards,
      pagination: {
        currentPage,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

const getBoardListQuery = (userId: string, search: string, sortOption: Record<string, 1 | -1>): PipelineStage[] => {
  const pipeline: PipelineStage[] = [
    // Find boards where the user is a member or admin
    {
      $lookup: {
        from: 'members',
        let: { boardId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$boardId', '$$boardId'] }, { $eq: ['$memberId', convertObjectId(userId)] }],
              },
            },
          },
        ],
        as: 'membership',
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$membership' }, 0] } } },

    // Get all members of the board
    {
      $lookup: {
        from: 'members',
        let: { boardId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$boardId', '$$boardId'] } } },
          {
            $lookup: {
              from: 'users',
              let: { memberId: '$memberId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$memberId'] } } },
                { $project: { _id: 1, first_name: 1, middle_name: 1, last_name: 1, email: 1 } },
              ],
              as: 'user',
            },
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, role: 1, user: 1 } },
        ],
        as: 'members',
      },
    },

    // Lookup workspace details
    { $lookup: { from: 'workspaces', localField: 'workspaceId', foreignField: '_id', as: 'workspace' } },
    { $unwind: { path: '$workspace', preserveNullAndEmptyArrays: true } },

    // Apply search filter if present
    ...(search
      ? [
          {
            $match: {
              $or: [{ name: { $regex: search, $options: 'i' } }],
            },
          },
        ]
      : []),

    // Sort the result based on sortOption
    { $sort: sortOption },

    // Project the desired fields
    { $project: { _id: 1, name: 1, description: 1, createdAt: 1, members: 1, workspace: 1 } },
  ];

  return pipeline;
};
