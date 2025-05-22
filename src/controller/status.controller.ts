import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createStatusSchema } from '../schemas/status.schema';
import { StatusModel } from '../model/status.model';
import mongoose from 'mongoose';
import { getSocket } from '../config/socketio.config';
import { MemberModel } from '../model/members.model';
import { saveRecentActivity } from '../helper/recentActivityService';
import { TaskModel } from '../model/task.model';

export const createStatusHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, createStatusSchema);
    // @ts-expect-error
    const user = req?.user;
    const { name, description, board_id } = req.body;

    const statusExist = await StatusModel.findOne({ name, board_id });

    if (statusExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Status already exists..!');
      return;
    }

    const lastStatus = await StatusModel.findOne({ board_id }).sort('-position').exec();
    const nextPosition = lastStatus ? lastStatus.position + 1 : 1;

    const status = await StatusModel.create({
      name,
      description,
      board_id,
      position: nextPosition,
    });

    const { io } = getSocket();
    if (io)
      io.to(status?.board_id?.toString() ?? '').emit('receive_status', {
        data: status,
      });

    const members = await MemberModel.find({ boardId: board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Created',
      'Status',
      board_id,
      visibleUserIds,
      `Status "${name}" has been created by ${user.first_name}`
    );

    APIResponse(res, true, HttpStatusCode.CREATED, 'Status successfully created', status);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getStatusByBoardIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { boardId } = req.query;
    const status = await StatusModel.find({ board_id: boardId })
      .sort({ position: 1 })
      .populate({
        path: 'board_id',
        select: '_id name description createdBy workspaceId',
        populate: [
          {
            path: 'createdBy',
            model: 'users',
            select: '_id first_name middle_name last_name email',
          },
          {
            path: 'workspaceId',
            model: 'workspaces',
            select: '_id name description',
          },
        ],
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Status successfully fetched', status);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateStatusHandler: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { statusId, newPosition, name, description, background } = req.body;
    // @ts-expect-error
    const user = req?.user;

    if (!statusId) {
      APIResponse(res, false, 400, 'statusId is required');
      return;
    }

    const movingStatus = await StatusModel.findById(statusId);
    if (!movingStatus) {
      APIResponse(res, false, 404, 'Status not found');
      return;
    }

    //  Update name and/or description if provided
    let updated = false;
    if (name !== undefined) {
      movingStatus.name = name;
      updated = true;
    }
    if (description !== undefined) {
      movingStatus.description = description;
      updated = true;
    }
    if (background !== undefined) {
      movingStatus.background = background;
      updated = true;
    }

    if (updated) await movingStatus.save();

    // If position change requested, handle reordering
    if (newPosition !== undefined && newPosition !== movingStatus.position) {
      const boardId = movingStatus.board_id;

      const statuses = await StatusModel.find({ board_id: boardId }).sort('position');

      const filtered = statuses.filter((s) => s._id.toString() !== statusId);

      filtered.splice(newPosition - 1, 0, movingStatus);

      const bulkOps = filtered.map((status, index) => ({
        updateOne: {
          filter: { _id: status._id },
          update: { position: index + 1 },
        },
      }));

      await StatusModel.bulkWrite(bulkOps);
      updated = true;
    }

    let updatedData;
    if (updated) {
      await movingStatus.save({ validateModifiedOnly: true });
      updatedData = await StatusModel.findById(movingStatus._id);
    }

    const { io } = getSocket();
    if (io)
      io.to(movingStatus.board_id?.toString() ?? '').emit('receive_updated_status', {
        data: !updated ? movingStatus : updatedData,
      });

    const message =
      updated && newPosition !== undefined && newPosition !== movingStatus.position
        ? 'Status updated and positions reordered successfully'
        : updated
          ? 'Status updated successfully'
          : newPosition !== undefined
            ? 'Status positions reordered successfully'
            : 'Nothing to update';

    const members = await MemberModel.find({ boardId: movingStatus.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Updated',
      'Status',
      movingStatus.board_id?.toString() ?? '',
      visibleUserIds,
      `Status has been updated by ${user.first_name}`
    );

    APIResponse(res, true, 200, message);
  } catch (err) {
    APIResponse(res, false, 500, err instanceof Error ? err.message : 'Internal Server Error');
  }
};

export const deleteStatusHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    // @ts-expect-error
    const user = req?.user;
    const statusExist = await StatusModel.findOne({ _id: id });
    if (!statusExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Status not found..!');
      return;
    }

    // Delete all tasks associated with this status
    await TaskModel.deleteMany({ status_list_id: id, board_id: statusExist.board_id }, { session });

    // Delete the status
    const status = await StatusModel.findByIdAndDelete({ _id: id }, { session });

    await session.commitTransaction();
    session.endSession();

    const members = await MemberModel.find({ boardId: statusExist.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    const { io } = getSocket();
    if (io)
      io.to(status?.board_id?.toString() ?? '').emit('remove_status', {
        data: status,
      });

    await saveRecentActivity(
      user._id.toString(),
      'Deleted',
      'Status',
      statusExist.board_id?.toString() ?? '',
      visibleUserIds,
      `Status has been deleted by ${user.first_name}`
    );
    APIResponse(res, true, HttpStatusCode.OK, 'Status successfully deleted', status);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const removeStatusBackgroundHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statusId } = req.params;
    // @ts-expect-error
    const user = req?.user;

    if (!statusId) {
      APIResponse(res, false, 400, 'statusId is required');
      return;
    }

    const movingStatus = await StatusModel.findById(statusId);
    if (!movingStatus) {
      APIResponse(res, false, 404, 'Status not found');
      return;
    }

    const isMember = await MemberModel.exists({ boardId: movingStatus.board_id, memberId: user._id });
    if (!isMember) {
      APIResponse(res, false, HttpStatusCode.FORBIDDEN, 'You are not a member of this board.');
      return;
    }

    // Set background to default
    movingStatus.background = '#FFF';
    await movingStatus.save({ validateModifiedOnly: true });

    const updatedStatus = await StatusModel.findById(statusId);

    // Emit updated status to board room
    const { io } = getSocket();
    if (io) {
      io.to(movingStatus.board_id?.toString() ?? '').emit('receive_updated_status', {
        data: updatedStatus,
      });
    }

    const message = 'Status background removed successfully';

    // Find members to notify
    const members = await MemberModel.find({ boardId: movingStatus.board_id }).select('memberId');
    const visibleUserIds = members.map((m: any) => m.memberId.toString());

    await saveRecentActivity(
      user._id.toString(),
      'Removed Color',
      'Status',
      movingStatus.board_id?.toString() ?? '',
      visibleUserIds,
      `Status background has been removed by ${user.first_name}`
    );

    APIResponse(res, true, 200, message);
  } catch (err) {
    APIResponse(res, false, 500, err instanceof Error ? err.message : 'Internal Server Error');
  }
};
