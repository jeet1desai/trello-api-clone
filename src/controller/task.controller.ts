import e, { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode, TaskStatus } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose, { Types } from 'mongoose';
import { TaskModel } from '../model/task.model';
import { addEstimatedTimeSchema, attachmentSchema, createTaskSchema, duplicateTaskSchema } from '../schemas/task.schema';
import { getSocket } from '../config/socketio.config';
import { deleteFromCloudinary } from '../utils/cloudinaryFileUpload';
import { saveMultipleFilesToCloud } from '../helper/saveMultipleFiles';
import { emitToUser } from '../utils/socket';
import { TaskMemberModel } from '../model/taskMember.model';
import { NotificationModel } from '../model/notification.model';
import { convertObjectId, MEMBER_ROLES } from '../config/app.config';
import { getResourceType } from '../helper/getResourceType';
import { TaskLabelModel } from '../model/taskLabel.model';
import { CommentModel } from '../model/comment.model';
import { MemberModel } from '../model/members.model';
import { saveRecentActivity } from '../helper/recentActivityService';
import { parseCSVBuffer } from '../utils/parseCSVBuffer';
import { taskRowSchema } from '../schemas/taskrow.schema';
import { StatusModel } from '../model/status.model';
import { createObjectCsvStringifier } from 'csv-writer';
import { BoardModel } from '../model/board.model';
import path from 'path';
import fs from 'fs';
import { convert } from 'html-to-text';
import { ActiveTimerModel } from '../model/activeTimer.model';

type BaseQuery = {
  status_list_id: string;
};

type FilterQuery = BaseQuery & {
  $or?: Array<{ assigned_to: string | { $in: string[] } } | { created_by: string | { $in: string[] } } | { _id: { $in: string[] } }>;
  $and?: Array<{ _id: { $in: string[] } | { $nin: string[] } } | { $or: Array<any> } | Record<string, any>>;
  status?: string;
  end_date?: { $ne: null } | null | { $lt: Date; $ne: null } | { $gte: Date; $lt: Date; $ne: null };
  _id?: { $in: string[] } | { $nin: string[] };
};

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

    const newTask: any = await TaskModel.create({
      title,
      status_list_id,
      board_id,
      created_by: user._id,
      position: nextPosition,
      estimated_hours: 0,
      estimated_minutes: 0,
      total_estimated_time: 0,
    });

    const { io } = getSocket();
    if (io)
      io.to(newTask.board_id?.toString() ?? '').emit('receive-new-task', {
        data: newTask,
      });

    const members = await MemberModel.find({ boardId: board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Created',
      'Task',
      board_id,
      visibleUserIds,
      `Task "${title}" was created by ${user.first_name}`,
      newTask?._id?.toString()
    );

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task successfully created', newTask);
  } catch (err) {
    return next(err);
  }
};

export const getTaskByStatusIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    //@ts-expect-error
    const user = req?.user;
    const currentUserId = user._id;

    const { statusId, filterBy: filterByRaw, markAsDone, hasDueDate, hasOverDue, dueTimeframe, labelIds, hasMember } = req.body;

    if (!statusId || typeof statusId !== 'string' || !statusId.trim()) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, "Missing or invalid 'statusId' parameter.");
    }

    if (!mongoose.Types.ObjectId.isValid(statusId)) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, "Invalid 'statusId' format.");
    }

    // 1. Get task IDs where user is a member
    const filterByArray: string[] = Array.isArray(filterByRaw) ? filterByRaw.map(String) : typeof filterByRaw === 'string' ? [filterByRaw] : ['me'];

    const isAll = filterByArray.includes('all');
    const isMe = filterByArray.includes('me');

    const resolvedFilterBy: string[] = isAll || isMe ? [currentUserId.toString(), ...filterByArray] : filterByArray;

    let taskIdsWithMembership: string[] = [];

    if (!isAll) {
      const memberTasks = await TaskMemberModel.find({
        member_id: { $in: resolvedFilterBy },
      }).select('task_id');

      taskIdsWithMembership = memberTasks.map((m) => m.task_id?.toString()).filter((id): id is string => Boolean(id));
    }
    // 2. Construct query
    const query: FilterQuery = {
      status_list_id: statusId,
    };

    // Add filter for markAsDone if provided
    if (markAsDone && markAsDone !== undefined) {
      query.status = markAsDone === true ? TaskStatus.COMPLETED : TaskStatus.INCOMPLETE;
    }

    // Add filter for due date presence if provided
    if (hasDueDate !== undefined) {
      if (hasDueDate === true) {
        query.end_date = { $ne: null };
      } else {
        query.end_date = null;
      }
    }
    if (hasOverDue !== undefined) {
      if (hasOverDue === true) {
        const now = new Date();
        query.end_date = { $lt: now, $ne: null };
      } else {
        query.end_date = null;
      }
    }

    if (dueTimeframe && query.end_date !== null) {
      const now = new Date();
      let startDate = new Date(now);
      let endDate: Date;

      switch (dueTimeframe) {
        case 'day':
          endDate = new Date(now);
          endDate.setDate(endDate.getDate() + 2);
          break;
        case 'week':
          endDate = new Date(now);
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'month':
          endDate = new Date(now);
          endDate.setDate(endDate.getDate() + 30);
          break;
        default:
          endDate = new Date(now);
          endDate.setDate(endDate.getDate() + 1);
      }

      query.end_date = {
        $gte: startDate,
        $lt: endDate,
        $ne: null,
      };
    }

    if (!isAll) {
      query.$or = [];

      if (isMe) {
        query.$or.push({ assigned_to: currentUserId }, { created_by: currentUserId }, { _id: { $in: taskIdsWithMembership } });
      } else {
        query.$or.push(
          { assigned_to: { $in: resolvedFilterBy } },
          { created_by: { $in: resolvedFilterBy } },
          { _id: { $in: taskIdsWithMembership } }
        );
      }
    }

    if (hasMember !== undefined) {
      if (hasMember === false) {
        const tasksWithMembers = await TaskMemberModel.find().select('task_id');
        const taskIdsWithMembers = tasksWithMembers.map((m) => m.task_id?.toString()).filter((id): id is string => Boolean(id));

        if (query.$or) {
          query.$and = [{ _id: { $nin: taskIdsWithMembers } }, { $or: query.$or }];
          delete query.$or;
        } else {
          query._id = { $nin: taskIdsWithMembers };
        }
      }
    }

    let taskIds: string[] = [];
    if (labelIds && Array.isArray(labelIds) && labelIds.length > 0) {
      const taskLabels = await TaskLabelModel.find({
        label_id: { $in: labelIds.map((id) => (mongoose.Types.ObjectId.isValid(id) ? id : null)).filter(Boolean) },
      }).select('task_id');

      taskIds = taskLabels.map((tl) => tl.task_id?.toString()).filter((id): id is string => Boolean(id));

      if (taskIds.length > 0) {
        if (query.$or) {
          query.$and = [{ _id: { $in: taskIds } }, { $or: query.$or }];
          delete query.$or;
        } else {
          query._id = { $in: taskIds };
        }
      }
    }

    const tasks = await TaskModel.find(query)
      .sort({ position: 1 })
      .select(
        '_id title description attachment board_id status_list_id created_by position status start_date end_date priority assigned_to estimated_hours estimated_minutes actual_time_spent timer_start_time is_timer_active '
      )
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
        path: 'assigned_to',
        select: '_id first_name last_name',
      });

    // 4. Enhance task details
    const taskList = await Promise.all(
      tasks.map(async (task) => {
        const [taskLabels, commentCount] = await Promise.all([
          TaskLabelModel.find({ task_id: task._id }).populate({
            path: 'label_id',
            select: '_id name backgroundColor textColor boardId',
          }),
          CommentModel.countDocuments({ task_id: task._id }),
        ]);

        return {
          ...task.toObject(),
          labels: taskLabels.map((tl) => tl.label_id),
          comments: commentCount,
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
      .select(
        '_id title description attachment board_id status_list_id created_by position status start_date end_date priority assigned_to estimated_hours estimated_minutes total_estimated_time actual_time_spent timer_start_time is_timer_active timer_status timer_sessions'
      )
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
        select: '_id first_name middle_name last_name email profile_image',
      })
      .populate({
        path: 'assigned_to',
        select: '_id first_name last_name',
      });

    const response: any = tasks?.toObject();
    if (tasks?.is_timer_active && tasks?.timer_start_time) {
      const currentElapsed = new Date().getTime() - tasks.timer_start_time.getTime();
      response.current_elapsed = currentElapsed;
      response.total_current_time = tasks?.actual_time_spent ? Number(tasks.actual_time_spent) + currentElapsed : currentElapsed;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Task details successfully fetched', response);
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
      updatedtData1 = await TaskModel.findById(movingTask._id).populate({
        path: 'assigned_to',
        select: '_id first_name last_name',
      });
    }

    const { io } = getSocket();

    if (io)
      io.to(movingTask.board_id?.toString() ?? '').emit('receive-updated-task', {
        data: !updated ? movingTask : updatedtData1,
      });

    const message = updated ? 'Task updated successfully' : 'Nothing to update';

    const members = await MemberModel.find({ boardId: movingTask.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Updated',
      'Task',
      movingTask?.board_id?.toString() ?? '',
      visibleUserIds,
      `Task was updated by ${user.first_name}`,
      movingTask._id.toString()
    );

    APIResponse(res, true, 200, message, !updated ? movingTask : updatedtData1);
  } catch (err) {
    APIResponse(res, false, 500, err instanceof Error ? err.message : 'Internal Server Error');
  }
};

export const deleteTaskHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // @ts-expect-error
    const user = req?.user;
    const taskExist = await TaskModel.findOne({ _id: id });
    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }
    const tasks = await TaskModel.findByIdAndDelete({ _id: id });

    const members = await MemberModel.find({ boardId: taskExist.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await Promise.all([TaskLabelModel.deleteMany({ task_id: id }), TaskMemberModel.deleteMany({ task_id: id })]);

    const { io } = getSocket();
    if (io)
      io.to(tasks?.board_id?.toString() ?? '').emit('remove_task', {
        data: tasks,
      });
    await saveRecentActivity(
      user._id.toString(),
      'Deleted',
      'Task',
      taskExist?.board_id?.toString() ?? '',
      visibleUserIds,
      `${taskExist.title} Task was deleted by ${user.first_name}`,
      taskExist?._id?.toString()
    );
    APIResponse(res, true, HttpStatusCode.OK, 'Task successfully deleted', tasks);
  } catch (err) {
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

    let visibleUserIds = [user._id.toString()];

    const { io } = getSocket();
    if (io)
      io.to(updateAttachment?.board_id?.toString() ?? '').emit('upload-attachment-task', {
        data: updateAttachment,
      });
    if (taskMembers.length > 0) {
      taskMembers.forEach(async (member: any) => {
        visibleUserIds.push(member?.member_id.toString());
        const notification = await NotificationModel.create({
          message: `New attachment has been uploaded by "${user.first_name} ${user.last_name}"`,
          action: 'invited',
          receiver: convertObjectId(member.member_id.toString()),
          sender: user,
          link: `/board/${taskExist.board_id?.toString()}?task_id=${taskExist._id?.toString()}`,
        });
        emitToUser(io, member?.member_id.toString(), 'receive_notification', { data: notification });
      });
    }

    await saveRecentActivity(
      user._id.toString(),
      'Uploaded',
      'Attachment',
      taskExist?.board_id?.toString() ?? '',
      visibleUserIds,
      `Attachment has been uploaded by ${user.first_name}`,
      taskExist?._id?.toString()
    );

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
    const resourfceType = await getResourceType(attachmentData.imageName);
    await deleteFromCloudinary(attachmentData.imageId, resourfceType);

    taskExist.attachment = taskExist.attachment.filter((att: any) => att._id.toString() !== imageId);
    const updateAttachment = await taskExist.save();

    let visibleUserIds = [user._id.toString()];

    const { io } = getSocket();
    if (io)
      io.to(updateAttachment?.board_id?.toString() ?? '').emit('remove_task_attachment', {
        data: updateAttachment,
      });
    if (taskMembers.length > 0) {
      taskMembers.forEach(async (member: any) => {
        visibleUserIds.push(member?.member_id.toString());
        const notification = await NotificationModel.create({
          message: `Attachment has been removed by "${user.first_name} ${user.last_name}"`,
          action: 'invited',
          receiver: convertObjectId(member.member_id.toString()),
          sender: user,
          link: `/board/${taskExist.board_id?.toString()}?task_id=${taskExist._id?.toString()}`,
        });
        emitToUser(io, member?.member_id.toString(), 'receive_notification', { data: notification });
      });
    }

    await saveRecentActivity(
      user._id.toString(),
      'Deleted',
      'Attachment',
      taskExist?.board_id?.toString() ?? '',
      visibleUserIds,
      `Attachment has been deleted by ${user.first_name}`,
      taskExist?._id?.toString()
    );

    APIResponse(res, true, HttpStatusCode.OK, 'Attachment successfully deleted', updateAttachment);
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

export const duplicateTaskHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await validateRequest(req.body, duplicateTaskSchema);
    // @ts-expect-error
    const user = req?.user;
    const { taskId, title } = req.body;

    // Find the original task
    const originalTask = await TaskModel.findById(taskId).lean();
    if (!originalTask) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found');
      return;
    }

    const requestingMember = await MemberModel.findOne({ boardId: originalTask.board_id, memberId: user._id });

    if (!requestingMember) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You do not have permission to duplicate task');
      return;
    }

    // Create a new task with the same properties
    const duplicatedTask = new TaskModel({
      title: title,
      description: originalTask.description,
      board_id: originalTask.board_id,
      status_list_id: originalTask.status_list_id,
      created_by: user._id,
      assigned_to: originalTask.assigned_to,
      start_date: originalTask.start_date,
      end_date: originalTask.end_date,
      priority: originalTask.priority,
      position: 0,
      status: originalTask.status,
      attachment: originalTask.attachment,
      estimated_hours: originalTask.estimated_hours,
      estimated_minutes: originalTask.estimated_minutes,
    });
    const savedTask = await duplicatedTask.save();

    // Duplicate task members if any
    const taskMembers = await TaskMemberModel.find({ task_id: taskId });
    if (taskMembers.length > 0) {
      const newTaskMembers = taskMembers.map((member) => ({
        task_id: savedTask._id,
        member_id: member.member_id,
        board_id: originalTask.board_id,
      }));
      await TaskMemberModel.insertMany(newTaskMembers);
    }

    // Duplicate task labels if any
    const taskLabels = await TaskLabelModel.find({ task_id: taskId });
    if (taskLabels.length > 0) {
      const newTaskLabels = taskLabels.map((label) => ({
        task_id: savedTask._id,
        label_id: label.label_id,
      }));
      await TaskLabelModel.insertMany(newTaskLabels);
    }

    // Emit socket event for the new task
    const { io } = getSocket();
    if (io) {
      io.to(originalTask.board_id?.toString() ?? '').emit('receive-new-task', {
        data: savedTask,
      });
    }

    // Save recent activity
    const members = await MemberModel.find({ boardId: originalTask.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Duplicated',
      'Task',
      originalTask.board_id?.toString() ?? '',
      visibleUserIds,
      `Task "${originalTask.title}" was duplicated by ${user.first_name}`,
      savedTask._id.toString()
    );

    APIResponse(res, true, HttpStatusCode.CREATED, 'Task successfully duplicated', savedTask);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof mongoose.Error.CastError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid task ID');
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, err.message);
    }
    return next(err);
  }
};

export const getUpcomingDeadlineTasksHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    //@ts-expect-error
    const user = req?.user;

    // Get all boards where user is a member
    const memberBoards = await MemberModel.find({ memberId: user._id }).select('boardId');
    const boardIds = memberBoards.map((member) => member.boardId);

    if (boardIds.length === 0) {
      APIResponse(res, true, HttpStatusCode.OK, 'No boards found for the user', []);
      return;
    }

    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);

    const query = {
      board_id: { $in: boardIds },
      end_date: {
        $gte: now,
        $lte: sevenDaysFromNow,
        $ne: null,
      },
      status: { $ne: TaskStatus.COMPLETED },
      $or: [{ assigned_to: user._id }, { created_by: user._id }],
    };

    const tasks = await TaskModel.find(query)
      .sort({ end_date: 1 })
      .select('_id title description attachment board_id status_list_id created_by position status start_date end_date priority assigned_to')
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
        path: 'assigned_to',
        select: '_id first_name last_name',
      });

    // Enhance task details with labels and comment count
    const taskList = await Promise.all(
      tasks.map(async (task) => {
        const [taskLabels, commentCount] = await Promise.all([
          TaskLabelModel.find({ task_id: task._id }).populate({
            path: 'label_id',
            select: '_id name backgroundColor textColor boardId',
          }),
          CommentModel.countDocuments({ task_id: task._id }),
        ]);

        return {
          ...task.toObject(),
          labels: taskLabels.map((tl) => tl.label_id),
          comments: commentCount,
        };
      })
    );

    APIResponse(res, true, HttpStatusCode.OK, 'Upcoming deadline tasks successfully fetched', taskList);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const addEstimatedTimeHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, addEstimatedTimeSchema);

    //@ts-expect-error
    const user = req?.user;
    const { task_id, hours, minutes } = req.body;

    if (hours < 0 || minutes < 0 || minutes > 59) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid time estimation. Hours must be >= 0 and minutes must be 0-59.');
      return;
    }

    const task = await TaskModel.findById(task_id);
    if (!task) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    const taskMembers = await TaskMemberModel.find({ task_id: task_id });
    if (!taskMembers.map((tm) => tm.member_id?.toString()).includes(user._id.toString())) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'Only task members can add estimated time');
      return;
    }

    const existingTotalMinutes = Number(task.estimated_hours * 60) + Number(task.estimated_minutes);
    const newTotalMinutes = Number(hours * 60) + Number(minutes);

    if (existingTotalMinutes > newTotalMinutes) {
      const actualTrackedMinutes = task.actual_time_spent ? Math.ceil(task.actual_time_spent / (1000 * 60)) : 0;

      if (newTotalMinutes < actualTrackedMinutes) {
        APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Cannot decrease estimation below already tracked time.');
        return;
      }
    }

    task.estimated_hours = Number(hours);
    task.estimated_minutes = Number(minutes);
    await task.save();

    APIResponse(res, true, HttpStatusCode.OK, 'Estimated time added successfully', task);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const startTimerHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // @ts-expect-error
    const user = req?.user;

    const task = await TaskModel.findById(id);
    if (!task) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    if (task?.assigned_to?.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'Only assigned user can start timer');
      return;
    }

    const existingActiveTimer = await ActiveTimerModel.findOne({ user_id: user._id });
    if (existingActiveTimer) {
      const data = { taskId: existingActiveTimer.task_id, boardId: task.board_id };
      APIResponse(
        res,
        false,
        HttpStatusCode.BAD_REQUEST,
        'You already have an active timer running. Please stop it before starting a new one.',
        data
      );
      return;
    }

    if (task?.timer_status === 'completed') {
      const totalEstimatedMs = task.estimated_hours * 60 * 60 * 1000 + task.estimated_minutes * 60 * 1000;

      if (totalEstimatedMs <= (task.actual_time_spent || 0)) {
        APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Cannot start timer. Estimated time must be greater than actual time spent.');
        return;
      }
      task.timer_status = 'in-progress';
    }

    const startTime = new Date();
    task.timer_start_time = startTime;
    task.is_timer_active = true;
    task.timer_status = 'in-progress';
    await task.save();

    await ActiveTimerModel.create({ user_id: user._id, task_id: task._id, start_time: startTime });

    APIResponse(res, true, HttpStatusCode.OK, 'Timer started successfully', {
      startTime: startTime,
      estimatedEndTime: new Date(startTime.getTime() + (task.total_estimated_time - task.actual_time_spent)),
      totalEstimatedTime: task.total_estimated_time,
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const stopTimerHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // @ts-expect-error
    const user = req?.user;

    const task = await TaskModel.findById(id);
    if (!task) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    if (task?.assigned_to?.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'Only assigned user can stop timer');
      return;
    }

    const activeTimer = await ActiveTimerModel.findOne({ user_id: user._id, task_id: task._id });
    if (!activeTimer) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'No active timer found for this task.');
      return;
    }

    const endTime = new Date();
    const sessionDuration = endTime.getTime() - activeTimer?.start_time?.getTime();

    task.actual_time_spent += sessionDuration;
    task.timer_start_time = null;
    task.is_timer_active = false;
    task.timer_sessions.push({ start_time: activeTimer.start_time, end_time: endTime, duration: sessionDuration });
    if (task.actual_time_spent >= task.total_estimated_time) {
      task.timer_status = 'completed';
    } else {
      task.timer_status = 'in-progress';
    }

    await task.save();
    await ActiveTimerModel.deleteOne({ _id: activeTimer._id });

    APIResponse(res, true, HttpStatusCode.OK, 'Timer stopped successfully', {
      sessionDuration: sessionDuration,
      totalTimeSpent: task.actual_time_spent,
      status: task.timer_status,
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getTimerStatusHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // @ts-expect-error
    const user = req?.user;

    const task = await TaskModel.findById(id);
    if (!task) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    const activeTimer = await ActiveTimerModel.findOne({ user_id: user._id, task_id: task._id });
    if (!activeTimer) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'No active timer found for this task.');
      return;
    }

    const currentTime = new Date();
    const elapsedTime = currentTime.getTime() - activeTimer.start_time.getTime();
    const remainingTime = Number(task.total_estimated_time) - (Number(elapsedTime) + Number(task.actual_time_spent));

    const response = {
      hasActiveTimer: true,
      taskId: task._id,
      taskTitle: task.title,
      startTime: activeTimer.start_time,
      totalEstimatedTime: task.total_estimated_time,
      elapsedTime: elapsedTime,
      remainingTime: remainingTime,
      isOvertime: elapsedTime >= task.total_estimated_time,
      estimatedHours: Number(task.estimated_hours),
      estimatedMinutes: Number(task.estimated_minutes),
    };

    APIResponse(res, true, HttpStatusCode.OK, 'Timer status', response);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const importTasksFromCSV = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'CSV file is missing' });
      return;
    }

    const tasks = await parseCSVBuffer(req.file.buffer);

    const { board_id } = req.body;

    for (const row of tasks) {
      await taskRowSchema.validate(row);

      //@ts-expect-error
      const user = req?.user;

      let status = await StatusModel.findOne({ name: row.status, board_id });
      if (!status) {
        const lastStatus = await StatusModel.findOne({ board_id }).sort('-position').exec();
        const nextPositionStatus = lastStatus ? lastStatus.position + 1 : 1;

        status = await StatusModel.create({
          name: row.status,
          board_id,
          position: nextPositionStatus,
        });
        const { io } = getSocket();

        if (io)
          io.to(status?.board_id?.toString() ?? '').emit('receive_status', {
            data: status,
          });
      }

      const taskExist = await TaskModel.findOne({
        title: row.title,
        status_list_id: status?.id,
        board_id: board_id,
      });

      if (taskExist) continue;

      const lastTask = await TaskModel.findOne({ status_list_id: status?.id, board_id: board_id }).sort('-position').exec();

      const nextPosition = lastTask ? lastTask.position + 1 : 1;

      const newTask = await TaskModel.create({
        title: row.title,
        status_list_id: status?.id,
        board_id: board_id,
        created_by: user._id,
        position: nextPosition,
        estimated_hours: 0,
        estimated_minutes: 0,
      });

      const { io } = getSocket();

      if (io) {
        io.to(newTask.board_id?.toString() ?? '').emit('receive-new-task', { data: newTask });
      }

      const members = await MemberModel.find({ boardId: board_id }).select('memberId');
      const visibleUserIds = members.map((m: any) => m.memberId.toString());

      await saveRecentActivity(
        user._id.toString(),
        'Created',
        'Status',
        board_id,
        visibleUserIds,
        `Status "${row.status}" has been created by ${user.first_name}`
      );

      await saveRecentActivity(
        user._id.toString(),
        'Created',
        'Task',
        board_id,
        visibleUserIds,
        `Task "${row.title}" was created by ${user.first_name}`
      );
    }

    APIResponse(res, true, 201, 'Tasks imported successfully');
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, err.message);
    }
  }
};

export const exportTasks = async (req: Request, res: Response) => {
  try {
    const boardId = req.params.boardId;
    const { csv, boardName } = await exportTasksCSVByBoardId(boardId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${boardName.replace(/\s+/g, '_')}.csv"`);

    res.send(csv);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const exportTasksCSVByBoardId = async (boardId: string): Promise<{ csv: string; boardName: string }> => {
  const board = await BoardModel.findById(boardId);
  if (!board) throw new Error('Board not found');

  const tasks = await TaskModel.find({ board_id: boardId })
    .populate('board_id', 'name')
    .populate('status_list_id', 'name')
    .populate('assigned_to', 'email')
    .populate('created_by', 'email');

  const taskIds = tasks.map((task) => task._id);

  const [taskLabels, taskMembers] = await Promise.all([
    TaskLabelModel.find({ task_id: { $in: taskIds } }).populate('label_id', 'name'),
    TaskMemberModel.find({ task_id: { $in: taskIds } }).populate('member_id', 'first_name last_name'),
  ]);

  const labelsMap: Record<string, string[]> = {};
  for (const label of taskLabels) {
    const key = (label.task_id as Types.ObjectId).toString();
    if (!labelsMap[key]) labelsMap[key] = [];
    if (label.label_id && 'name' in label.label_id) {
      labelsMap[key].push((label.label_id as any).name);
    }
  }

  const membersMap: Record<string, string[]> = {};
  for (const member of taskMembers) {
    const key = (member.task_id as Types.ObjectId).toString();
    if (!membersMap[key]) membersMap[key] = [];
    if (member.member_id && 'first_name' in member.member_id) {
      const user = member.member_id as any;
      membersMap[key].push(`${user.first_name} ${user.last_name || ''}`.trim());
    }
  }

  const records = tasks.map((task) => {
    const id = task._id.toString();
    return {
      Title: task.title,
      Description: convert(task?.description || '', { wordwrap: false }),
      Board: (task.board_id as any)?.name || '',
      StatusName: (task.status_list_id as any)?.name || '',
      Priority: task.priority,
      CreatedBy: (task.created_by as any)?.email,
      AssignedTo: (task.assigned_to as any)?.email || '',
      StartDate: task.start_date?.toISOString().split('T')[0] || '',
      EndDate: task.end_date?.toISOString().split('T')[0] || '',
      Status: task.status || '',
      Labels: labelsMap[id]?.join('- ') || '',
      Members: membersMap[id]?.join('- ') || '',
    };
  });

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: 'Title', title: 'Title' },
      { id: 'Description', title: 'Description' },
      { id: 'Board', title: 'Board' },
      { id: 'StatusName', title: 'Status Name' },
      { id: 'Priority', title: 'Priority' },
      { id: 'CreatedBy', title: 'Created By' },
      { id: 'AssignedTo', title: 'Assigned To' },
      { id: 'StartDate', title: 'Start Date' },
      { id: 'EndDate', title: 'End Date' },
      { id: 'Status', title: 'Status' },
      { id: 'Labels', title: 'Labels' },
      { id: 'Members', title: 'Members' },
    ],
  });

  const header = csvStringifier.getHeaderString();
  const body = csvStringifier.stringifyRecords(records);

  return {
    csv: header + body,
    boardName: board.name || 'board',
  };
};
