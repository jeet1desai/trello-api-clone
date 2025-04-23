import { Request, Response, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { addTaskLabelSchema } from '../schemas/task.schema';
import { getSocket, users } from '../config/socketio.config';
import { TaskLabelModel } from '../model/taskLabel.model';
import { TaskMemberModel } from '../model/taskMember.model';
import { emitToUser } from '../utils/socket';
import { convertObjectId } from '../config/app.config';
import { NotificationModel } from '../model/notification.model';

export const addTaskLabelHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, addTaskLabelSchema);
    // @ts-expect-error
    const user = req?.user;
    const { task_id, label_id } = req.body;
    const taskExist = await TaskModel.findOne({ _id: task_id });

    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }
    const taskMembers = await TaskMemberModel.find({ task_id: task_id });

    const taskLabelExist = await TaskLabelModel.findOne({ task_id, label_id });
    if (taskLabelExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Label already exist in this task..!');
      return;
    }

    const newTaskLabel = await TaskLabelModel.create({
      task_id,
      label_id,
    });

    const taskLabel = await TaskLabelModel.findById(newTaskLabel._id)
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'label_id',
        select: '_id name backgroundColor textColor boardId',
      });

    const { io } = getSocket();
    if (taskMembers.length > 0) {
      taskMembers.forEach(async (member: any) => {
        const notification = await NotificationModel.create({
          message: `New label added in task`,
          action: 'invited',
          receiver: convertObjectId(member.member_id.toString()),
          sender: convertObjectId(user._id.toString()),
        });
        emitToUser(io, member?.member_id.toString(), 'receive-new-task-label', { data: taskLabel });
        emitToUser(io, member?.member_id.toString(), 'receive_notification', { data: notification });
      });
    }

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task label successfully added', taskLabel);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getTaskLabelHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const taskLabel = await TaskLabelModel.find({ task_id: taskId })
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'label_id',
        select: '_id name backgroundColor textColor boardId',
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Task label successfully fetched', taskLabel);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const deleteTaskLabelHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { taskId, labelId } = req.query;
    // @ts-expect-error
    const user = req?.user;
    const taskLabelExist: any = await TaskLabelModel.findOne({ task_id: taskId, label_id: labelId });
    if (!taskLabelExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task label not found..!');
      return;
    }
    const taskMembers = await TaskMemberModel.find({ task_id: taskLabelExist.task_id });

    const taskLabel = await TaskLabelModel.findOneAndDelete({ task_id: taskId, label_id: labelId }, { session });
    await session.commitTransaction();
    session.endSession();

    const { io } = getSocket();
    if (taskMembers.length > 0) {
      taskMembers.forEach(async (member: any) => {
        const notification = await NotificationModel.create({
          message: `Label removed from task`,
          action: 'invited',
          receiver: convertObjectId(member.member_id.toString()),
          sender: convertObjectId(user._id.toString()),
        });
        emitToUser(io, member?.member_id.toString(), 'receive_notification', { data: notification });
      });
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Task label successfully removed', taskLabel);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
