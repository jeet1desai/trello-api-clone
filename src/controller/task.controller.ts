import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { attachmentSchema, createTaskSchema } from '../schemas/task.schema';
import { getSocket, users } from '../config/socketio.config';
import { deleteFromCloudinary } from '../utils/cloudinaryFileUpload';
import { saveMultipleFilesToCloud } from '../helper/saveMultipleFiles';
import { emitToUser } from '../utils/socket';
import { TaskMemberModel } from '../model/taskMember.model';
import { NotificationModel } from '../model/notification.model';
import { convertObjectId } from '../config/app.config';
import { TaskLabelModel } from '../model/taskLabel.model';
import { CommentModel } from '../model/comment.model';

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
    if (user._id.toString()) {
      emitToUser(io, user._id.toString(), 'receive-new-task', { data: newTask });
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
      .select('_id title description attachment board_id status_list_id created_by position status start_date end_date priority')
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

    const taskList = await Promise.all(
      tasks.map(async (task) => {
        const taskLabels = await TaskLabelModel.find({ task_id: task._id }).populate({
          path: 'label_id',
          select: '_id name backgroundColor textColor boardId',
        });

        const taskComment = await CommentModel.countDocuments({ task_id: task._id });

        return {
          ...task.toObject(),
          labels: taskLabels.map((tl) => tl.label_id),
          comments: taskComment,
        };
      })
    );

    APIResponse(res, true, HttpStatusCode.OK, 'Task successfully fetched', taskList);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getTaskByIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const tasks = await TaskModel.findById({ _id: id })
      .select('_id title description attachment board_id status_list_id created_by position status start_date end_date priority')
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
      })
      .populate({
        path: 'created_by',
        select: '_id first_name  middle_name last_name email profile_image',
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Task details successfully fetched', tasks);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateTaskHandler: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskId, newPosition, title, description, status_list_id, status, start_date, end_date, priority } = req.body;
    // @ts-expect-error
    const user = req?.user;

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

    if (start_date) {
      movingTask.start_date = start_date;
      updated = true;
    }

    if (end_date) {
      movingTask.end_date = end_date;
      updated = true;
    }

    if (priority) {
      movingTask.priority = priority;
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

      const newListTasks = await TaskModel.find({
        status_list_id,
        _id: { $ne: taskId },
      }).sort('position');

      const shiftedTasks: any = newListTasks
        .map((task) => {
          if (task.position >= newPosition) {
            return {
              updateOne: {
                filter: { _id: task._id },
                update: { $inc: { position: 1 } },
              },
            };
          }
          return null;
        })
        .filter(Boolean);

      await TaskModel.bulkWrite(shiftedTasks);

      movingTask.status_list_id = status_list_id;
      movingTask.position = newPosition;
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

    let updatedtData1;
    if (updated) {
      await movingTask.save({ validateModifiedOnly: true });
      updatedtData1 = await TaskModel.findById(movingTask._id);
    }

    const { io } = getSocket();

    if (user._id.toString()) {
      emitToUser(io, user._id.toString(), 'receive-updated-task', { data: !updated ? movingTask : updatedtData1 });
    }

    const message = updated ? 'Task updated successfully' : 'Nothing to update';

    APIResponse(res, true, 200, message, !updated ? movingTask : updatedtData1);
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

export const uploadAttachmentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task_id } = req.body;
    // @ts-expect-error
    const user = req?.user;
    await validateRequest(req.body, attachmentSchema);

    const attachments = req.files as Express.Multer.File[];

    if (!attachments?.length) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'No files uploaded');
      return;
    }

    const taskExist = await TaskModel.findOne({ _id: task_id });
    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }
    const taskMembers = await TaskMemberModel.find({ task_id: task_id });

    const uploadResponse = await saveMultipleFilesToCloud(attachments, 'tasks');

    const attachmentsData = uploadResponse.map((result) => ({
      imageId: result.imageId,
      url: result.url,
      imageName: result.imageName,
    }));

    const updateAttachment = await TaskModel.findByIdAndUpdate(
      task_id,
      {
        $push: {
          attachment: {
            $each: attachmentsData,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    const { io } = getSocket();
    if (taskMembers.length > 0) {
      taskMembers.forEach(async (member: any) => {
        const notification = await NotificationModel.create({
          message: `New attachment has been uploaded by "${user.first_name} ${user.last_name}"`,
          action: 'invited',
          receiver: convertObjectId(member.member_id.toString()),
          sender: convertObjectId(user._id.toString()),
        });
        emitToUser(io, member?.member_id.toString(), 'upload-attachment-task', { data: updateAttachment });
        emitToUser(io, member?.member_id.toString(), 'receive_notification', { data: notification });
      });
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Attachment successfully uploaded', updateAttachment);
    return;
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, err.message);
    }
  }
};

export const deleteAttachmentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskId, imageId } = req.query;
    // @ts-expect-error
    const user = req?.user;
    const taskExist = await TaskModel.findOne({ _id: taskId });
    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }
    const taskMembers = await TaskMemberModel.find({ task_id: taskId });

    const attachmentData: any = taskExist.attachment.find((item: any) => item._id == imageId);
    if (!attachmentData?.imageId) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Image not found..!');
      return;
    }
    const result = await deleteFromCloudinary(attachmentData.imageId);
    const removeImage = taskExist.attachment.filter((item: any) => item._id != imageId);

    const updateAttachment = await TaskModel.findByIdAndUpdate(taskId, {
      attachment: removeImage,
    });

    const { io } = getSocket();
    if (taskMembers.length > 0) {
      taskMembers.forEach(async (member: any) => {
        const notification = await NotificationModel.create({
          message: `Attachment has been removed by "${user.first_name} ${user.last_name}"`,
          action: 'invited',
          receiver: convertObjectId(member.member_id.toString()),
          sender: convertObjectId(user._id.toString()),
        });
        emitToUser(io, member?.member_id.toString(), 'receive_notification', { data: notification });
      });
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Attachment successfully deleted');
    return;
  } catch (err) {
    if (err instanceof mongoose.Error.CastError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid task ID');
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, err.message);
    }
  }
};

export const getAttachmentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskId } = req.query;

    const taskExist = await TaskModel.findOne({ _id: taskId });
    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Attachments fetched successfully', taskExist.attachment);
    return;
  } catch (err) {
    if (err instanceof mongoose.Error.CastError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid task ID');
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, err.message);
    }
  }
};
