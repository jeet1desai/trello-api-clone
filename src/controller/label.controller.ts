import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createLabelSchema } from '../schemas/label.schema';
import { BoardModel } from '../model/board.model';
import mongoose from 'mongoose';
import { convertObjectId } from '../config/app.config';
import { LabelModel } from '../model/label.model';

export const createLabelHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await validateRequest(req.body, createLabelSchema);

    // @ts-expect-error
    const user = req.user;
    const { name, background_color, text_color, board } = req.body;

    const boardDetails = await BoardModel.findById({ _id: board });

    if (!boardDetails) {
      await session.abortTransaction();
      session.endSession();

      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found', req.body);
      return;
    }

    const [label] = await LabelModel.create(
      [
        {
          name: name,
          backgroundColor: background_color,
          textColor: text_color,
          boardId: convertObjectId(board.toString()),
          createdBy: convertObjectId(user._id.toString()),
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    APIResponse(res, true, HttpStatusCode.CREATED, 'Label successfully created', label);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
