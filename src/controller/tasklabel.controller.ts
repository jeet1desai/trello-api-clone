import { Request, Response, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { addTaskLabelSchema } from '../schemas/task.schema';
import { getSocket } from '../config/socketio.config';
import { TaskLabelModel } from '../model/taskLabel.model';

export const addTaskLabelHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, addTaskLabelSchema);
    const { task_id, label_id } = req.body;
    const taskExist = await TaskModel.findOne({ _id: task_id });

    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    const taskLabelExist = await TaskLabelModel.findOne({ task_id, label_id });
    if (taskLabelExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Label already exist in this task..!');
      return;
    }

    const newTaskLabel = await TaskLabelModel.create({
      task_id,
      label_id,
    });

    const { io } = getSocket();
    if (io) {
      io.to(taskExist.board_id as unknown as string).emit('task-label-added', newTaskLabel);
    }

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task label successfully added', newTaskLabel);
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
    const { id } = req.params;
    const taskLabelExist = await TaskLabelModel.findOne({ _id: id });
    if (!taskLabelExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task label not found..!');
      return;
    }
    const taskLabel = await TaskLabelModel.findByIdAndDelete({ _id: id }, { session });
    await session.commitTransaction();
    session.endSession();
    APIResponse(res, true, HttpStatusCode.OK, 'Task label successfully removed', taskLabel);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
