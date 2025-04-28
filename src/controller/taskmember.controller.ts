import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { addTaskMemberSchema, createTaskSchema } from '../schemas/task.schema';
import { getSocket, users } from '../config/socketio.config';
import { TaskMemberModel } from '../model/taskMember.model';
import { emitToUser } from '../utils/socket';
import User from '../model/user.model';
import { convertObjectId } from '../config/app.config';
import { NotificationModel } from '../model/notification.model';
import { saveRecentActivity } from '../helper/recentActivityService';

export const addTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, addTaskMemberSchema);
    // @ts-expect-error
    const user = req?.user;
    const { task_id, member_id } = req.body;
    const taskExist = await TaskModel.findOne({ _id: task_id });
    const memberDetails = await User.findOne({ _id: member_id });

    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    const taskMemberExist = await TaskMemberModel.findOne({ task_id, member_id });
    if (taskMemberExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Member already joined this task..!');
      return;
    }

    const newTaskMember = await TaskMemberModel.create({
      task_id,
      member_id,
    });

    const taskMembers = await TaskMemberModel.findOne({ _id: newTaskMember._id })
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'member_id',
        select: '_id first_name  middle_name last_name email profile_image',
      });

    const { io } = getSocket();
    if (memberDetails._id.toString()) {
      const notification = await NotificationModel.create({
        message: `Welcome, You added as a member in this task`,
        action: 'invited',
        receiver: convertObjectId(memberDetails._id.toString()),
        sender: user,
      });

      emitToUser(io, memberDetails._id.toString(), 'receive_new_task-member', { data: taskMembers });
      emitToUser(io, memberDetails._id.toString(), 'receive_notification', { data: notification });
    }

    const members = await TaskMemberModel.find({ task_id: task_id }).select('member_id');
    const visibleUserIds = members.map((m: any) => m.member_id.toString());
    const memberName = (taskMembers?.member_id as any)?.first_name || '';

    await saveRecentActivity(
      user._id.toString(),
      'Added',
      'Task Member',
      taskExist?.board_id?.toString() || '',
      visibleUserIds,
      `"${memberName}" has been added in Task ${taskExist.title} by ${user.first_name}`
    );

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task member successfully joined', taskMembers);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const taskMembers = await TaskMemberModel.find({ task_id: taskId })

      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'member_id',
        select: '_id first_name  middle_name last_name email profile_image',
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Task member successfully fetched', taskMembers);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const deleteTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { taskId, memberId } = req.query;
    // @ts-expect-error
    const user = req?.user;

    const taskMemberExist: any = await TaskMemberModel.findOne({ task_id: taskId, member_id: memberId });
    if (!taskMemberExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task member not found..!');
      return;
    }
    const taskExist = await TaskModel.findOne({ _id: taskId });

    const taskMembers = await TaskMemberModel.findOne({ _id: memberId })
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'member_id',
        select: '_id first_name  middle_name last_name email profile_image',
      });
    const members = await TaskMemberModel.find({ task_id: taskId }).select('member_id');

    const taksMember = await TaskMemberModel.findOneAndDelete({ task_id: taskId, member_id: memberId }, { session });

    const { io } = getSocket();
    if (taskMemberExist?.member_id.toString()) {
      const notification = await NotificationModel.create({
        message: `You removed as a member from this task`,
        action: 'invited',
        receiver: convertObjectId(taskMemberExist?.member_id.toString()),
        sender: user,
      });

      emitToUser(io, taskMemberExist?.member_id.toString(), 'receive_notification', { data: notification });
      emitToUser(io, taskMemberExist?.member_id.toString(), 'task-member-removed', { data: taskMemberExist });
    }
    await session.commitTransaction();
    session.endSession();

    let visibleUserIds = members.map((m: any) => m.member_id.toString());
    const memberName = (taskMembers?.member_id as any)?.first_name || '';
    visibleUserIds.push(memberId?.toString());
    await saveRecentActivity(
      user._id.toString(),
      'Deleted',
      'Task Member',
      taskExist?.board_id?.toString() || '',
      visibleUserIds,
      `"${memberName}" has been removed from Task ${taskExist?.title} by ${user.first_name}`
    );

    APIResponse(res, true, HttpStatusCode.OK, 'Task member successfully removed', taksMember);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
