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
import { commentSchema } from '../schemas/comment.schema';
import { CommentModel } from '../model/comment.model';

export const addCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, commentSchema);
    // @ts-expect-error
    const user = req?.user;
    const { comment, task_id } = req.body;
    const taskExist = await TaskModel.findOne({ _id: task_id });

    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    const newComment = await CommentModel.create({
      comment,
      task_id,
      commented_by: user._id,
    });

    const { io } = getSocket();
    const socketId = users.get(user._id.toString());
    if (socketId) {
      io?.to(socketId).emit('receive_comment', { data: newComment });
    } else {
      console.warn(`No socket connection found for user: ${user._id.toString()}`);
    }

    APIResponse(res, true, HttpStatusCode.CREATED, 'Comment successfully added', newComment);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const comments = await CommentModel.find({ task_id: taskId })
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'commented_by',
        select: '_id first_name middle_name last_name email profile_image status',
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Comment successfully fetched', comments);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const deleteCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const taskLabelExist = await CommentModel.findOne({ _id: id });
    if (!taskLabelExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Comment not found..!');
      return;
    }
    const taskLabel = await CommentModel.findByIdAndDelete({ _id: id }, { session });
    await session.commitTransaction();
    session.endSession();
    APIResponse(res, true, HttpStatusCode.OK, 'Comment successfully removed', taskLabel);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    // @ts-expect-error
    const user = req?.user;

    const updatedComment = await CommentModel.findByIdAndUpdate({ _id: id }, { comment }, { runValidators: true, returnDocument: 'after' });

    if (!updatedComment) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Comment not found', req.body);
      return;
    }

    const { io } = getSocket();
    const socketId = users.get(user._id.toString());
    if (socketId) {
      io?.to(socketId).emit('receive_updated_comment', { data: updatedComment });
    } else {
      console.warn(`No socket connection found for user: ${user._id.toString()}`);
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Comment successfully updated', updatedComment);
    return;
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
      return;
    }
  }
};
