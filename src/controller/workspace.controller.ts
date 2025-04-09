import express from 'express';
import { WorkSpaceModel } from '../model/workspace.model';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createWorkspaceSchema } from '../schemas/workspace.schema';

export const createWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await validateRequest(req.body, createWorkspaceSchema);

    const { name, description } = req.body;
    // @ts-expect-error
    const user = req?.user;
    const data = await WorkSpaceModel.create({
      name,
      description,
      createdBy: user?._id,
    });
    APIResponse(res, true, HttpStatusCode.CREATED, 'Workspace successfully created', data);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else {
      return next(err);
    }
  }
};

export const updateWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const workspace = await WorkSpaceModel.findByIdAndUpdate({ _id: id }, { name, description }, { runValidators: true, returnDocument: 'after' });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully updated', workspace);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else {
      return next(err);
    }
  }
};

export const deleteWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const workspace = await WorkSpaceModel.findByIdAndDelete({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully deleted', workspace);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else {
      return next(err);
    }
  }
};

export const getWorkSpaceDetailController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const workspace = await WorkSpaceModel.findById({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully fetched', workspace);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else {
      return next(err);
    }
  }
};
