import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import User from '../model/user.model';
import { WorkSpaceModel } from '../model/workspace.model';
import { BoardModel } from '../model/board.model';
import { TaskModel } from '../model/task.model';

export const getDashboardCardCountHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;
    const workspaceCountData = await WorkSpaceModel.countDocuments({ createdBy: user._id });
    const boardCountData = await BoardModel.countDocuments({ createdBy: user._id });
    const taskCountData = await TaskModel.countDocuments({ created_by: user._id, status: 'Completed' });
    const totalTaskCountData = await TaskModel.countDocuments({ created_by: user._id });

    const countData = {
      workspace: workspaceCountData,
      board: boardCountData,
      task: taskCountData,
      totalTask: totalTaskCountData,
    };

    APIResponse(res, true, HttpStatusCode.OK, 'Dashboard count successfully fetched', countData);
    return;
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
      return;
    }
  }
};

export const getAnalyticHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;
    const workspaceCountData = await WorkSpaceModel.countDocuments({ createdBy: user._id });
    const boardCountData = await BoardModel.countDocuments({ createdBy: user._id });
    const taskCountData = await TaskModel.countDocuments({ created_by: user._id, status: 'Completed' });
    const totalTaskCountData = await TaskModel.countDocuments({ created_by: user._id });

    const countData = {
      workspace: workspaceCountData,
      board: boardCountData,
      task: taskCountData,
      totalTask: totalTaskCountData,
    };

    APIResponse(res, true, HttpStatusCode.OK, 'Dashboard count successfully fetched', countData);
    return;
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
      return;
    }
  }
};
