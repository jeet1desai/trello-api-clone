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

export const addTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, addTaskMemberSchema);
    // @ts-expect-error
    const user = req?.user;
    const { task_id, member_id } = req.body;
    const taskExist = await TaskModel.findOne({ _id: task_id });

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

    const { io } = getSocket();
    const socketId = users.get(user._id.toString());
    if (socketId) {
      io?.to(socketId).emit('task-member-joined', { data: newTaskMember });
    } else {
      console.warn(`No socket connection found for user: ${user._id.toString()}`);
    }

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task member successfully joined', newTaskMember);
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
    const { id } = req.params;
    const taskMemberExist = await TaskMemberModel.findOne({ _id: id });
    if (!taskMemberExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task member not found..!');
      return;
    }
    const taksMember = await TaskMemberModel.findByIdAndDelete({ _id: id }, { session });
    await session.commitTransaction();
    session.endSession();
    APIResponse(res, true, HttpStatusCode.OK, 'Task member successfully removed', taksMember);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
