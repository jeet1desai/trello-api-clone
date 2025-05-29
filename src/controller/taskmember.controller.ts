import { Request, Response, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { addTaskMemberSchema } from '../schemas/task.schema';
import { getSocket } from '../config/socketio.config';
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

    const taskMembers: any = await TaskMemberModel.findOne({ _id: newTaskMember._id })
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'member_id',
        select: '_id first_name  middle_name last_name email profile_image',
      });

    const { io } = getSocket();
    if (io)
      io.to(taskMembers?.task_id?.board_id?.toString() ?? '').emit('receive_new_task-member', {
        data: taskMembers,
      });
    if (memberDetails._id.toString()) {
      const notification = await NotificationModel.create({
        message: `Welcome, You added as a member in task "${taskExist.title}"`,
        action: 'invited',
        receiver: convertObjectId(memberDetails._id.toString()),
        sender: user,
        link: `/board/${taskExist.board_id?.toString()}?task_id=${taskExist._id?.toString()}`,
      });

      emitToUser(io, memberDetails._id.toString(), 'receive_notification', { data: notification });
    }

    const members = await TaskMemberModel.find({ task_id: task_id }).select('member_id');
    const visibleUserIds = members.map((m: any) => m.member_id.toString());
    const memberName = (taskMembers?.member_id as any)?.first_name ?? '';

    await saveRecentActivity(
      user._id.toString(),
      'Added',
      'Task Member',
      taskExist?.board_id?.toString() ?? '',
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

export const assignTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
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

    // Check if already assigned
    if (taskExist.assigned_to && taskExist.assigned_to.toString() === member_id) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Member already assigned to this task..!');
      return;
    }

    // Update the task with the assigned member
    await TaskModel.findByIdAndUpdate(task_id, { assigned_to: member_id });

    // Also add to task members if not already there
    const taskMemberExist = await TaskMemberModel.findOne({ task_id, member_id });
    if (!taskMemberExist) {
      await TaskMemberModel.create({
        task_id,
        member_id,
      });
    }

    const assignedMember = {
      assigned_to: { _id: member_id, first_name: memberDetails.first_name, last_name: memberDetails.last_name },
      status_list_id: taskExist.status_list_id,
      task_id: taskExist._id,
    };

    const { io } = getSocket();
    if (io)
      io.to(taskExist.board_id?.toString() ?? '').emit('receive_task_assigned_member', {
        data: assignedMember,
      });

    if (memberDetails._id.toString()) {
      const notification = await NotificationModel.create({
        message: `You have been assigned to task "${taskExist.title}"`,
        action: 'assigned',
        receiver: convertObjectId(memberDetails._id.toString()),
        sender: user,
        link: `/board/${taskExist.board_id?.toString()}?task_id=${taskExist._id?.toString()}`,
      });

      emitToUser(io, memberDetails._id.toString(), 'receive_notification', { data: notification });
    }

    const members = await TaskMemberModel.find({ task_id: task_id }).select('member_id');
    const visibleUserIds = members.map((m: any) => m.member_id.toString());
    const memberName = memberDetails?.first_name ?? '';

    await saveRecentActivity(
      user._id.toString(),
      'Added',
      'Assign Member',
      taskExist?.board_id?.toString() ?? '',
      visibleUserIds,
      `"${memberName}" has been assigned to Task ${taskExist.title} by ${user.first_name}`
    );

    APIResponse(res, true, HttpStatusCode.CREATED, 'Member successfully assigned to task', assignedMember);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const unassignTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;
    const { taskId } = req.query;

    const taskExist = await TaskModel.findOne({ _id: taskId });
    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    if (!taskExist.assigned_to) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'No member assigned to this task..!');
      return;
    }

    const previouslyAssigned = taskExist.assigned_to;
    const memberDetails = await User.findOne({ _id: previouslyAssigned });

    // Update the task to remove assignment
    await TaskModel.findByIdAndUpdate(taskId, { assigned_to: null });

    const unassignedMember = {
      assigned_to: { _id: memberDetails._id, first_name: memberDetails.first_name, last_name: memberDetails.last_name },
      status_list_id: taskExist.status_list_id,
      task_id: taskExist._id,
    };

    const { io } = getSocket();
    if (io)
      io.to(taskExist.board_id?.toString() ?? '').emit('unassigned_task_member', {
        data: unassignedMember,
      });

    if (memberDetails && memberDetails._id.toString()) {
      const notification = await NotificationModel.create({
        message: `You have been unassigned from task "${taskExist.title}"`,
        action: 'unassigned',
        receiver: convertObjectId(memberDetails._id.toString()),
        sender: user,
      });

      emitToUser(io, memberDetails._id.toString(), 'receive_notification', { data: notification });
    }

    const members = await TaskMemberModel.find({ task_id: taskId }).select('member_id');
    const visibleUserIds = members.map((m: any) => m.member_id.toString());
    visibleUserIds.push(previouslyAssigned.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Removed',
      'Assigned Member',
      taskExist?.board_id?.toString() ?? '',
      visibleUserIds,
      `A member has been unassigned from Task ${taskExist.title} by ${user.first_name}`
    );

    APIResponse(res, true, HttpStatusCode.OK, 'Member successfully unassigned from task');
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getTaskMemberHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const { search = '' } = req.query;

    const taskMembers = await getTaskMembersBySearch(taskId, search as string);
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
    const taskExist: any = await TaskModel.findOne({ _id: taskId });

    const taskMembers: any = await TaskMemberModel.findOne({ _id: memberId })
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
    if (io)
      io.to(taskExist?.board_id?.toString() ?? '').emit('task-member-removed', {
        data: taskMemberExist,
      });
    if (taskMemberExist?.member_id.toString()) {
      const notification = await NotificationModel.create({
        message: `You removed as a member from task "${taskExist.title}"`,
        action: 'invited',
        receiver: convertObjectId(taskMemberExist?.member_id.toString()),
        sender: user,
      });

      emitToUser(io, taskMemberExist?.member_id.toString(), 'receive_notification', { data: notification });
    }
    await session.commitTransaction();
    session.endSession();

    let visibleUserIds = members.map((m: any) => m.member_id.toString());
    const memberName = (taskMembers?.member_id as any)?.first_name ?? '';
    visibleUserIds.push(memberId?.toString());
    await saveRecentActivity(
      user._id.toString(),
      'Deleted',
      'Task Member',
      taskExist?.board_id?.toString() ?? '',
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

const getTaskMembersBySearch = async (taskId: string, search: string = '') => {
  return TaskMemberModel.aggregate([
    {
      $match: {
        task_id: new mongoose.Types.ObjectId(taskId),
      },
    },
    {
      $lookup: {
        from: 'tasks',
        localField: 'task_id',
        foreignField: '_id',
        as: 'task',
      },
    },
    { $unwind: '$task' },
    {
      $lookup: {
        from: 'users',
        localField: 'member_id',
        foreignField: '_id',
        as: 'memberId',
      },
    },
    { $unwind: '$memberId' },
    // Search filter
    {
      $match: {
        $or: [
          { 'memberId.first_name': { $regex: search, $options: 'i' } },
          { 'memberId.last_name': { $regex: search, $options: 'i' } },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ['$memberId.first_name', ' ', '$memberId.last_name'] },
                regex: search,
                options: 'i',
              },
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        task_id: {
          _id: '$task_id',
          title: '$task.title',
          description: '$task.description',
          board_id: '$task.board_id',
          status_list_id: '$task.status_list_id',
          position: '$task.position',
        },
        member_id: {
          _id: '$memberId._id',
          first_name: '$memberId.first_name',
          middle_name: '$memberId.middle_name',
          last_name: '$memberId.last_name',
          email: '$memberId.email',
        },
        createdAt: 1,
        updatedAt: 1,
        __v: 1,
      },
    },
  ]);
};
