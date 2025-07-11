import express from 'express';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createBoardSchema } from '../schemas/board.schema';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import mongoose, { PipelineStage } from 'mongoose';
import { BoardModel } from '../model/board.model';
import { BOARD_BACKGROUND_TYPE, convertObjectId, getSortOption, MEMBER_INVITE_STATUS, MEMBER_ROLES, SORT_TYPE } from '../config/app.config';
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
import { BoardBackgroundModel } from '../model/boardBackground.model';
import { UserBoardBackgroundModel } from '../model/userBoardBackground.model';
import path from 'path';
import { RepeatTaskModel } from '../model/repeatTask.model';

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
            link: `/board/${board._id.toString()}`,
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
            link: `/board/${board._id.toString()}`,
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
            link: `/board/${board._id.toString()}`,
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
            link: `/board/${board._id.toString()}`,
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
      RepeatTaskModel.deleteMany({ task_id: { $in: taskIds } }, { session }),
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
    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        createdBy: 1,
        boardOwner: 1,
        workspaceId: 1,
        workspace: 1,
        members: 1,
        background: {
          $ifNull: ['$background', '#FFF'],
        },
        backgroundType: {
          $ifNull: ['$backgroundType', BOARD_BACKGROUND_TYPE.COLOR],
        },
        createdAt: 1,
        updatedAt: 1,
        __v: 1,
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
  const templatePath = path.join(process.cwd(), 'email-templates', 'board-invite.ejs');

  const html = await ejs.renderFile(templatePath, {
    inviteeName: existingUser ? `${existingUser.first_name} ${existingUser.last_name}` : '',
    inviterName: `${user.first_name} ${user.last_name}`,
    boardName: board.name,
    workspaceName: workspace.name,
    link: `${process.env.BOARD_FE_URL}/invitation/${inviteId}`,
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
    const { page = '1', perPage = '12', search = '', sortType = SORT_TYPE.CreatedDateDesc, all = 'false' } = req.query || {};
    const isGetAll = all === 'true';

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

    // Use pagination only if 'all' is not true
    const finalPipeline = isGetAll ? pipeline : [...pipeline, { $skip: skip }, { $limit: limit }];

    // Execute paginated query
    const boards = await BoardModel.aggregate(finalPipeline);

    // If all is requested, skip pagination metadata
    if (isGetAll) {
      APIResponse(res, true, HttpStatusCode.OK, 'All boards successfully fetched', {
        boards,
      });
    }

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
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
  const safeSearch = escapeRegex(search);

  const pipeline: PipelineStage[] = [
    // Find boards where the user is a member
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

    // Filter boards that have this user as a member
    {
      $match: {
        $expr: { $gt: [{ $size: '$membership' }, 0] },
      },
    },

    // Add isFavorite flag for this user
    {
      $addFields: {
        isFavorite: {
          $cond: [
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: '$membership',
                      as: 'm',
                      cond: { $eq: ['$$m.isFavorite', true] },
                    },
                  },
                },
                0,
              ],
            },
            true,
            false,
          ],
        },
      },
    },

    // Get all members of the board
    {
      $lookup: {
        from: 'members',
        let: { boardId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$boardId', '$$boardId'] },
            },
          },
          {
            $lookup: {
              from: 'users',
              let: { memberId: '$memberId' },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$_id', '$$memberId'] },
                  },
                },
                {
                  $project: {
                    _id: 1,
                    first_name: 1,
                    middle_name: 1,
                    last_name: 1,
                    email: 1,
                  },
                },
              ],
              as: 'user',
            },
          },
          {
            $unwind: {
              path: '$user',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 1,
              role: 1,
              user: 1,
            },
          },
        ],
        as: 'members',
      },
    },

    // Get workspace details
    {
      $lookup: {
        from: 'workspaces',
        localField: 'workspaceId',
        foreignField: '_id',
        as: 'workspace',
      },
    },
    {
      $unwind: {
        path: '$workspace',
        preserveNullAndEmptyArrays: true,
      },
    },

    // Apply search filter if provided
    ...(search
      ? [
        {
          $match: {
            $or: [{ name: { $regex: safeSearch, $options: 'i' } }],
          },
        },
      ]
      : []),

    // Sort
    {
      $sort: sortOption,
    },

    // Final projection
    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        createdAt: 1,
        members: 1,
        workspace: 1,
        isFavorite: 1,
      },
    },
  ];

  return pipeline;
};

export const updateFavoriteStatus = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { boardId } = req.params;
    const { isFavorite } = req.body;
    // @ts-expect-error
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(boardId)) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid board ID');
      return;
    }

    // Validate isFavorite
    if (typeof isFavorite !== 'boolean') {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, '`isFavorite` must be a boolean value');
      return;
    }

    // Check if board exists
    const boardExists = await BoardModel.exists({ _id: boardId });
    if (!boardExists) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found');
      return;
    }

    // Check if the user is a member of this board
    const updated = await MemberModel.findOneAndUpdate(
      {
        boardId,
        memberId: userId,
      },
      {
        $set: { isFavorite },
      },
      { new: true }
    );

    if (!updated) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'You are not a member of this board');
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, `${isFavorite ? 'Board Added to Favorite list' : 'Board Removed From Favorite list'}`, updated);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const boardBackgrounds = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const boardBackground = await BoardBackgroundModel.find().lean();

    APIResponse(res, true, HttpStatusCode.OK, 'Board Background fetch successfully', boardBackground);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateBoardBackground = async (req: express.Request, res: express.Response) => {
  const { io } = getSocket();
  try {
    const { boardId, backgroundType, background, imageId } = req.body;
    // @ts-expect-error
    const user = req.user;

    if (!boardId || !backgroundType) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'boardId and backgroundType are required.');
      return;
    }

    if (!Object.values(BOARD_BACKGROUND_TYPE).includes(backgroundType)) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid backgroundType.');
      return;
    }

    const isMember = await MemberModel.exists({ boardId, memberId: user._id });
    if (!isMember) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You are not a member of this board.');
      return;
    }

    let backgroundValue = background;

    switch (backgroundType) {
      case BOARD_BACKGROUND_TYPE.CUSTOM:
        if (imageId) {
          const userImage = await UserBoardBackgroundModel.findOne({ _id: imageId, userId: user._id }).lean();
          if (!userImage) {
            APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Image not found or not owned by user.');
            return;
          }
          backgroundValue = userImage.imageUrl;
        }
        break;

      case BOARD_BACKGROUND_TYPE.IMAGE:
        if (imageId) {
          const image = await BoardBackgroundModel.findOne({ _id: imageId }).lean();
          if (!image) {
            APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board background image not found.');
            return;
          }
          backgroundValue = image.imageUrl;
        }
        break;

      case BOARD_BACKGROUND_TYPE.COLOR:
        backgroundValue = backgroundValue || '#FFF';
        break;
    }

    const board = await BoardModel.findByIdAndUpdate(
      boardId,
      {
        backgroundType,
        background: backgroundValue,
      },
      { new: true }
    );

    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found.');
      return;
    }

    const members = await MemberModel.find({ boardId }).select('memberId');
    const memberIds = members.map((m) => m?.memberId?.toString());

    memberIds.forEach((memberId) => {
      emitToUser(io, memberId?.toString(), 'receive_updated_board_background', { data: board });
    });

    APIResponse(res, true, HttpStatusCode.OK, 'Board background updated successfully.', board);
  } catch (err) {
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err instanceof Error ? err.message : 'Something went wrong');
  }
};

export const getBoardAnalytics = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { boardId } = req.params;

    const board = await BoardModel.findById(boardId);
    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found');
      return;
    }

    const tasks = await TaskModel.find({ board_id: boardId }).populate({
      path: 'assigned_to',
      select: '_id first_name last_name',
    });

    const userAnalytics: Map<string, any> = new Map();

    tasks.forEach((task: any) => {
      if (!task.assigned_to) return;
      const userId = task.assigned_to._id.toString();
      const userName = `${task.assigned_to.first_name} ${task.assigned_to.last_name}`;
      if (!userAnalytics.has(userId)) {
        userAnalytics.set(userId, {
          userId,
          name: userName,
          completedTasks: 0,
          totalTasks: 0,
          spendHours: 0,
          estimatedHours: 0,
          actualHours: 0,
          efficiency: 0,
        });
      }
      const userStats = userAnalytics.get(userId)!;
      userStats.estimatedHours += (task.total_estimated_time || 0) / (1000 * 60 * 60);
      userStats.actualHours += (task.actual_time_spent || 0) / (1000 * 60 * 60);
      userStats.totalTasks += 1;
      if (task.status === 'Completed') {
        userStats.completedTasks += 1;
      }
    });

    let totalSpendHours = 0;
    const usersList: any[] = [];
    userAnalytics.forEach((user) => {
      user.efficiency = user.estimatedHours > 0 ? (user.estimatedHours / user.actualHours) * 100 : 0;
      totalSpendHours += user.actualHours;
      usersList.push(user);
    });

    usersList.sort((a, b) => b.efficiency - a.efficiency);

    const response = {
      averageSpendHours: totalSpendHours / usersList.length,
      mostEffective: usersList[0]?.name || 'N/A',
      leastEffective: usersList[usersList.length - 1]?.name || 'N/A',
      usersList: usersList.map((user) => ({
        name: user.name,
        completedTasks: user.completedTasks,
        totalTasks: user.totalTasks,
        spendHours: Math.round(user.actualHours * 100) / 100,
        estimatedHours: Math.round(user.estimatedHours * 100) / 100,
      })),
      board: {
        backgroundType: board.backgroundType,
        background: board.background,
      },
    };

    APIResponse(res, true, HttpStatusCode.OK, 'Analytics fetched successfully', response);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getBoardStats = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { boardId } = req.query;
    // @ts-expect-error
    const userId = req.user._id;

    if (boardId) {
      // Fetch data for a specific board
      const board = await BoardModel.findById(boardId);
      if (!board) {
        APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found');
        return;
      }

      const totalUsers = await MemberModel.countDocuments({ boardId });
      const tasks = await TaskModel.find({ board_id: boardId });
      const totalSpentHours = tasks.reduce((acc, task) => acc + (task.actual_time_spent || 0) / (1000 * 60 * 60), 0);
      const totalTicketsClosed = tasks.filter((task) => task.status === 'Completed').length;
      const totalActiveTickets = tasks.filter((task) => task.status !== 'Completed').length;

      const boardMembers = await MemberModel.find({ boardId })
        .populate('memberId', 'first_name last_name email createdAt')
        .populate('boardId', 'name');

      const teamMembers = await Promise.all(
        boardMembers.map(async (member: any) => {
          const memberTasks = await TaskModel.find({ board_id: boardId, assigned_to: member.memberId._id });

          const spentHours = memberTasks.reduce((acc, task) => acc + (task.actual_time_spent || 0) / (1000 * 60 * 60), 0);
          const ticketsClosed = memberTasks.filter((task) => task.status === 'Completed').length;
          const activeTickets = memberTasks.filter((task) => task.status !== 'Completed').length;

          return {
            name: `${member.memberId.first_name} ${member.memberId.last_name}`,
            email: member.memberId.email,
            joined: member.memberId.createdAt,
            boardName: member.boardId.name,
            spentHours: Math.round(spentHours * 10) / 10,
            ticketsClosed,
            activeTickets,
          };
        })
      );

      const userTicketsCompleted = teamMembers.map((member) => ({
        name: member.name,
        ticketsClosed: member.ticketsClosed,
      }));

      const mostTicketsCompleted = userTicketsCompleted.reduce((prev, current) => (prev.ticketsClosed > current.ticketsClosed ? prev : current));

      const response = {
        overview: {
          totalUsers,
          totalSpentHours: Math.round(totalSpentHours * 10) / 10,
          totalTicketsClosed,
          totalActiveTickets,
          mostTicketsCompletedBy: mostTicketsCompleted.name,
          mostTicketsCompletedCount: mostTicketsCompleted.ticketsClosed,
        },
        teamMembers,
      };

      APIResponse(res, true, HttpStatusCode.OK, 'Board statistics fetched successfully', response);
    } else {
      // Fetch data for all boards the user is part of and aggregate the data
      const userBoards = await MemberModel.find({ memberId: userId }).populate('boardId', '_id name');

      let totalUsers = 0;
      let totalSpentHours = 0;
      let totalTicketsClosed = 0;
      let totalActiveTickets = 0;
      let allTeamMembers: any[] = [];
      let userTicketsCompletedMap: any = {};

      await Promise.all(
        userBoards.map(async (userBoard: any) => {
          const boardId = userBoard.boardId._id;
          const boardName = userBoard.boardId.name;

          const usersInBoard = await MemberModel.countDocuments({ boardId });
          const tasks = await TaskModel.find({ board_id: boardId });
          const spentHours = tasks.reduce((acc, task) => acc + (task.actual_time_spent || 0) / (1000 * 60 * 60), 0);
          const ticketsClosed = tasks.filter((task) => task.status === 'Completed').length;
          const activeTickets = tasks.filter((task) => task.status !== 'Completed').length;

          totalUsers += usersInBoard;
          totalSpentHours += spentHours;
          totalTicketsClosed += ticketsClosed;
          totalActiveTickets += activeTickets;

          const boardMembers = await MemberModel.find({ boardId }).populate('memberId', 'first_name last_name email createdAt');

          const teamMembers = await Promise.all(
            boardMembers.map(async (member: any) => {
              const memberTasks = await TaskModel.find({ board_id: boardId, assigned_to: member.memberId?._id });

              const memberSpentHours = memberTasks.reduce((acc, task) => acc + (task.actual_time_spent || 0) / (1000 * 60 * 60), 0);
              const memberTicketsClosed = memberTasks.filter((task) => task.status === 'Completed').length;
              const memberActiveTickets = memberTasks.filter((task) => task.status !== 'Completed').length;

              const memberName = `${member.memberId.first_name} ${member.memberId.last_name}`;

              if (!userTicketsCompletedMap[memberName]) {
                userTicketsCompletedMap[memberName] = 0;
              }
              userTicketsCompletedMap[memberName] += memberTicketsClosed;

              return {
                name: memberName,
                email: member.memberId.email,
                joined: member.memberId.createdAt,
                boardName,
                spentHours: Math.round(memberSpentHours * 10) / 10,
                ticketsClosed: memberTicketsClosed,
                activeTickets: memberActiveTickets,
              };
            })
          );

          allTeamMembers = [...allTeamMembers, ...teamMembers];
        })
      );

      const userTicketsCompleted = Object.keys(userTicketsCompletedMap).map((name) => ({
        name,
        ticketsClosed: userTicketsCompletedMap[name],
      }));

      const mostTicketsCompleted = userTicketsCompleted.reduce((prev, current) => (prev.ticketsClosed > current.ticketsClosed ? prev : current));

      const response = {
        overview: {
          totalUsers,
          totalSpentHours: Math.round(totalSpentHours * 10) / 10,
          totalTicketsClosed,
          totalActiveTickets,
          mostTicketsCompletedBy: mostTicketsCompleted.name,
          mostTicketsCompletedCount: mostTicketsCompleted.ticketsClosed,
        },
        teamMembers: allTeamMembers,
      };

      APIResponse(res, true, HttpStatusCode.OK, 'Statistics for all user boards fetched successfully', response);
    }
  } catch (error) {
    if (error instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, error.message);
    }
  }
};
