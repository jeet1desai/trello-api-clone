import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { createTaskSchema } from '../schemas/task.schema';
import { getSocket } from '../config/socketio.config';

export const createTaskHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, createTaskSchema);
    // @ts-expect-error
    const user = req?.user;
    const { title, status_list_id, board_id } = req.body;
    const taskExist = await TaskModel.findOne({ title, status_list_id, board_id });

    if (taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task already exists..!');
      return;
    }

    const lastTask = await TaskModel.findOne({ status_list_id, board_id }).sort('-position').exec();
    const nextPosition = lastTask ? lastTask.position + 1 : 1;

    const newTask = await TaskModel.create({
      title,
      status_list_id,
      board_id,
      created_by: user._id,
      position: nextPosition,
    });

    const { io } = getSocket();
    if (io) {
      io.to(board_id).emit('recieve-new-task', newTask);
    }

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task successfully created', newTask);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getTaskByStatusIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statusId } = req.query;
    const tasks = await TaskModel.find({ status_list_id: statusId })
      .sort({ position: 1 })
      .select('_id title description attachment board_id status_list_id created_by position status')
      .populate({
        path: 'status_list_id',
        select: '_id name description board_id',
        populate: [
          {
            path: 'board_id',
            model: 'boards',
            select: '_id name description',
          },
        ],
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Status successfully fetched', tasks);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateTaskHandler: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskId, newPosition, title, description, status_list_id, status } = req.body;

    if (!taskId) {
      APIResponse(res, false, 400, 'taskId is required');
      return;
    }

    const movingTask = await TaskModel.findById(taskId);
    if (!movingTask) {
      APIResponse(res, false, 404, 'Task not found');
      return;
    }

    const originalStatusListId = movingTask.status_list_id?.toString();

    // Track if fields were updated
    let updated = false;

    if (title !== undefined) {
      movingTask.title = title;
      updated = true;
    }

    if (description !== undefined) {
      movingTask.description = description;
      updated = true;
    }

    if (status !== undefined) {
      movingTask.status = status;
      updated = true;
    }

    const statusListChanged = status_list_id && status_list_id !== originalStatusListId;

    // Handle status list change
    if (statusListChanged) {
      // Reorder old status list after removing the task
      const oldTasks = await TaskModel.find({
        status_list_id: originalStatusListId,
        _id: { $ne: taskId },
      }).sort('position');

      const oldOps = oldTasks.map((task, index) => ({
        updateOne: {
          filter: { _id: task._id },
          update: { position: index + 1 },
        },
      }));

      await TaskModel.bulkWrite(oldOps);

      // Get new position in the new list
      const newListTasks = await TaskModel.find({ status_list_id }).sort('position');
      const newPositionInNewList = newListTasks.length + 1;

      movingTask.status_list_id = status_list_id;
      movingTask.position = newPositionInNewList;
      updated = true;
    }

    // Handle reorder within same status list
    if (!statusListChanged && newPosition !== undefined && newPosition !== movingTask.position) {
      const tasks = await TaskModel.find({
        status_list_id: movingTask.status_list_id,
        _id: { $ne: taskId },
      }).sort('position');

      tasks.splice(newPosition - 1, 0, movingTask);

      const reorderOps = tasks.map((task, index) => ({
        updateOne: {
          filter: { _id: task._id },
          update: { position: index + 1 },
        },
      }));

      await TaskModel.bulkWrite(reorderOps);
      updated = true;
    }

    if (updated) await movingTask.save();

    const message = updated ? 'Task updated successfully' : 'Nothing to update';

    APIResponse(res, true, 200, message, movingTask);
  } catch (err) {
    APIResponse(res, false, 500, err instanceof Error ? err.message : 'Internal Server Error');
  }
};

export const deleteTaskHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const statusExist = await TaskModel.findOne({ _id: id });
    if (!statusExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }
    const status = await TaskModel.findByIdAndDelete({ _id: id }, { session });
    await session.commitTransaction();
    session.endSession();
    APIResponse(res, true, HttpStatusCode.OK, 'Task successfully deleted', status);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
