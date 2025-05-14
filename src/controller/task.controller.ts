import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { attachmentSchema, createTaskSchema, duplicateTaskSchema } from '../schemas/task.schema';
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

type BaseQuery = {
  status_list_id: string;
};

type FilterQuery = BaseQuery & {
  $or?: Array<{ assigned_to: string | { $in: string[] } } | { created_by: string | { $in: string[] } } | { _id: { $in: string[] } }>;
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
    });

    const { io } = getSocket();
    if (io)
      io.to(newTask.board_id?.toString() ?? '').emit('receive-new-task', {
        data: newTask,
      });

    const members = await MemberModel.find({ boardId: board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(user._id.toString(), 'Created', 'Task', board_id, visibleUserIds, `Task "${title}" was created by ${user.first_name}`);

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

    const { statusId, filterBy: filterByRaw } = req.body;

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

    // 3. Fetch tasks
    const tasks = await TaskModel.find(query)
      .sort({ position: 1 })
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

    // 4. Enhance task details
    const taskList = await Promise.all(
      tasks.map(async (task) => {
        const [taskLabels, commentCount, memberCount] = await Promise.all([
          TaskLabelModel.find({ task_id: task._id }).populate({
            path: 'label_id',
            select: '_id name backgroundColor textColor boardId',
          }),
          CommentModel.countDocuments({ task_id: task._id }),
          TaskMemberModel.countDocuments({ task_id: task._id }),
        ]);

        return {
          ...task.toObject(),
          labels: taskLabels.map((tl) => tl.label_id),
          comments: commentCount,
          members: memberCount,
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
        path: 'created_by',
        select: '_id first_name middle_name last_name email profile_image',
      })
      .populate({
        path: 'assigned_to',
        select: '_id first_name last_name',
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
      `Task was udpated by ${user.first_name}`
    );

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
    // @ts-expect-error
    const user = req?.user;
    const taskExist = await TaskModel.findOne({ _id: id });
    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }
    const status = await TaskModel.findByIdAndDelete({ _id: id }, { session });
    await session.commitTransaction();
    session.endSession();

    const members = await MemberModel.find({ boardId: taskExist.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    const { io } = getSocket();
    if (io)
      io.to(status?.board_id?.toString() ?? '').emit('remove_task', {
        data: status,
      });
    await saveRecentActivity(
      user._id.toString(),
      'Deleted',
      'Task',
      taskExist?.board_id?.toString() ?? '',
      visibleUserIds,
      `Task was deleted by ${user.first_name}`
    );
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
      `Attachment has been uploaded by ${user.first_name}`
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
      `Attachment has been deleted by ${user.first_name}`
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
    const { taskId } = req.body;

    // Find the original task
    const originalTask = await TaskModel.findById(taskId).lean();
    if (!originalTask) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found');
      return;
    }

    const requestingMember = await MemberModel.findOne({ boardId: originalTask.board_id, memberId: user._id });
    if (!requestingMember || requestingMember.role !== MEMBER_ROLES.ADMIN) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You do not have permission to remove members');
      return;
    }

    // Create a new task with the same properties
    const duplicatedTask = new TaskModel({
      title: `${originalTask.title} - Copy`,
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
      `Task "${originalTask.title}" was duplicated by ${user.first_name}`
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
