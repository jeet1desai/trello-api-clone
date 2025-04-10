import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createStatusSchema } from '../schemas/status.schema';
import { StatusModel } from '../model/status.model';
import mongoose from 'mongoose';

export const createStatusHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, createStatusSchema);
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
    const { statusId, newPosition, name, description } = req.body;

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
    }

    const message =
      updated && newPosition !== undefined && newPosition !== movingStatus.position
        ? 'Status updated and positions reordered successfully'
        : updated
          ? 'Status updated successfully'
          : newPosition !== undefined
            ? 'Status positions reordered successfully'
            : 'Nothing to update';

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
    const statusExist = await StatusModel.findOne({ _id: id });
    if (!statusExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Status not found..!');
      return;
    }
    const status = await StatusModel.findByIdAndDelete({ _id: id }, { session });
    await session.commitTransaction();
    session.endSession();
    APIResponse(res, true, HttpStatusCode.OK, 'Status successfully deleted', status);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
