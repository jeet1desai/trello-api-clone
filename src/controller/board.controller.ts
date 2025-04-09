import express from 'express';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createBoardSchema } from '../schemas/board.schema';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import mongoose from 'mongoose';
import { BoardModel } from '../model/board.model';
import { convertObjectId, MEMBER_INVITE_STATUS, MEMBER_ROLES } from '../config/app.config';
import { WorkSpaceModel } from '../model/workspace.model';
import { MemberModel } from '../model/members.model';
import User from '../model/user.model';
import { BoardInviteModel } from '../model/boardInvite.model';
import { sendEmail } from '../utils/sendEmail';
import ejs from 'ejs';

export const createBoardController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await validateRequest(req.body, createBoardSchema);

    // @ts-expect-error
    const user = req.user;

    const { workspace, name, description, members } = req.body;

    const workspaceDetails = await WorkSpaceModel.findById({ _id: workspace });
    if (!workspaceDetails) {
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

    if (members && members.length > 0) {
      for (const email of members) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          await MemberModel.create(
            [
              {
                memberId: convertObjectId(existingUser._id.toString()),
                role: MEMBER_ROLES.MEMBER,
                boardId: convertObjectId(board?._id.toString()),
                workspaceId: convertObjectId(workspace.toString()),
              },
            ],
            { session }
          );
        } else {
          await BoardInviteModel.create(
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
        }

        const templatePath = __dirname + '/../helper/email-templates/board-invite.ejs';
        const html = await ejs.renderFile(templatePath, {
          inviteeName: existingUser ? `${existingUser.first_name} ${existingUser.last_name}` : '',
          inviterName: `${user.first_name} ${user.last_name}`,
          boardName: board.name,
          workspaceName: workspaceDetails.name,
          link: `${process.env.FE_URL}`,
        });

        const mailOptions = {
          to: email,
          subject: 'You are invited to join a board',
          html,
        };

        await sendEmail(mailOptions);
      }
    }

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
  try {
    // @ts-expect-error
    const user = req.user;

    const { id } = req.params;
    const { name, description, members } = req.body;

    const board = await BoardModel.findByIdAndUpdate({ _id: id }, { name, description }, { runValidators: true, returnDocument: 'after' });

    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }

    if (members && members.length > 0) {
      for (const email of members) {
        const existingUser = await User.findOne({ email });
        const workspaceDetails = await WorkSpaceModel.findById({ _id: board.workspaceId });

        if (!workspaceDetails) {
          APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
          return;
        }

        if (existingUser) {
          const member = await MemberModel.findOne({
            memberId: convertObjectId(existingUser._id.toString()),
            boardId: convertObjectId(board._id.toString()),
            workspaceId: convertObjectId(workspaceDetails._id.toString()),
          });
          if (!member) {
            await MemberModel.create({
              memberId: convertObjectId(existingUser._id.toString()),
              role: MEMBER_ROLES.MEMBER,
              boardId: convertObjectId(board._id.toString()),
              workspaceId: convertObjectId(workspaceDetails._id.toString()),
            });
          }
        } else {
          const invitedMember = await BoardInviteModel.findOne({
            email,
            role: MEMBER_ROLES.MEMBER,
            boardId: board._id,
            invitedBy: user._id,
            workspaceId: convertObjectId(workspaceDetails._id.toString()),
            status: MEMBER_INVITE_STATUS.PENDING,
          });
          if (!invitedMember) {
            await BoardInviteModel.create({
              email,
              role: MEMBER_ROLES.MEMBER,
              boardId: board._id,
              invitedBy: user._id,
              workspaceId: convertObjectId(workspaceDetails._id.toString()),
              status: MEMBER_INVITE_STATUS.PENDING,
            });
          }
        }

        const templatePath = __dirname + '/../helper/email-templates/board-invite.ejs';
        const html = await ejs.renderFile(templatePath, {
          inviteeName: existingUser ? `${existingUser.first_name} ${existingUser.last_name}` : '',
          inviterName: `${user.first_name} ${user.last_name}`,
          boardName: board.name,
          workspaceName: workspaceDetails.name,
          link: `${process.env.FE_URL}`,
        });

        const mailOptions = {
          to: email,
          subject: 'You are invited to join a board',
          html,
        };

        await sendEmail(mailOptions);
      }
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Board successfully updated', board);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
