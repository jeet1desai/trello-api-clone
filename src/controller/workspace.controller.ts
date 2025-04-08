import express from 'express';
import { WorkSpaceModel } from '../model/workspace.model';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';

export const createWorkSpaceController = async (req: express.Request, res: express.Response) => {
  try {
    const { name, description } = req.body;
    // @ts-expect-error
    const user = req?.user;
    const data = await WorkSpaceModel.create({
      name,
      description,
      createdBy: '67f3cb9504aa115c061c0634',
    });
    APIResponse(res, true, HttpStatusCode.CREATED, 'Workspace successfully created', data);
  } catch (err) {
    let errorMessage = 'Something went wrong';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, errorMessage, null);
  }
};

export const updateWorkSpaceController = async (req: express.Request, res: express.Response) => {
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
    let errorMessage = 'Something went wrong';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, errorMessage, null);
  }
};

export const deleteWorkSpaceController = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;

    const workspace = await WorkSpaceModel.findByIdAndDelete({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully deleted', workspace);
  } catch (err) {
    let errorMessage = 'Something went wrong';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, errorMessage, null);
  }
};

export const getWorkSpaceDetailController = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;

    const workspace = await WorkSpaceModel.findById({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully fetched', workspace);
  } catch (err) {
    let errorMessage = 'Something went wrong';
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, errorMessage, null);
  }
};
