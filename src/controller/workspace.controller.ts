import express from 'express';
import { WorkSpaceModel, WorkspaceModelType } from '../model/workspace.model';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createWorkspaceSchema } from '../schemas/workspace.schema';
import { getSortOption, MEMBER_ROLES, SORT_TYPE } from '../config/app.config';
import { MemberModel } from '../model/members.model';
import { saveRecentActivity } from '../helper/recentActivityService';
import { BoardModel } from '../model/board.model';
import { getWorkspaceBoardsQuery } from './board.controller';
import { FilterQuery } from 'mongoose';
import { getPagination } from '../utils/pagination';

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
    await saveRecentActivity(user._id.toString(), 'Created', 'Workspace', '', [user?._id.toString()], `${user.first_name} created new workspace`);
    APIResponse(res, true, HttpStatusCode.CREATED, 'Workspace successfully created', data);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    // @ts-expect-error
    const user = req?.user;
    const workspace = await WorkSpaceModel.findByIdAndUpdate({ _id: id }, { name, description }, { runValidators: true, returnDocument: 'after' });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    await saveRecentActivity(user._id.toString(), 'Updated', 'Workspace', '', [user?._id.toString()], `${user.first_name} updated workspace`);

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully updated', workspace);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const deleteWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;
    // @ts-expect-error
    const user = req?.user;
    const boards = await BoardModel.aggregate([...getWorkspaceBoardsQuery(id, user._id.toString()), { $count: 'total' }]);
    let workspace = null;
    if (boards[0]?.total > 0) {
      APIResponse(
        res,
        false,
        HttpStatusCode.UNPROCESSABLE_ENTITY,
        'This workspace cannot be deleted until all related boards are removed.',
        req.body
      );
      return;
    } else {
      workspace = await WorkSpaceModel.findByIdAndDelete({ _id: id });
    }
    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    await saveRecentActivity(user._id.toString(), 'Deleted', 'Workspace', '', [user?._id.toString()], `${user.first_name} deleted workspace`);

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully deleted', workspace);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getWorkSpaceDetailController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const workspace = await WorkSpaceModel.findById({ _id: id }).populate('createdBy', 'first_name last_name email');

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully fetched', workspace);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getAllWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;
    const { page = '1', perPage = '9', search = '', sortType } = req?.query || {};

    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(perPage) || 9;

    const {
      skip,
      limit,
      page: currentPage,
    } = getPagination({
      page: parsedPage,
      limit: parsedLimit,
    });

    const sortOption = getSortOption(parseInt(sortType as string) || SORT_TYPE.CreatedDateDesc);

    // 1. Get workspaceIds from boards where user is a member
    const boards = await MemberModel.find({ memberId: user._id, role: MEMBER_ROLES.MEMBER });
    const boardWorkspaceIds = boards.map((board) => board?.workspaceId?.toString());

    // 2. Find workspaces where user is creator or has a board inside if search
    const filters: FilterQuery<WorkspaceModelType> = {
      $and: [
        {
          $or: [{ createdBy: user._id }, { _id: { $in: boardWorkspaceIds } }],
        },
      ],
    };

    if (search) {
      filters.name = { $regex: search, $options: 'i' };
    }

    // 3. Get total count (for pagination metadata) ** Apply pagination, sorting, and populate
    const [workspaces, totalCount] = await Promise.all([
      WorkSpaceModel.find(filters).populate('createdBy', 'first_name last_name email').sort(sortOption).skip(skip).limit(limit),
      WorkSpaceModel.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // 4. Return response
    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully fetched', {
      workspaces: workspaces,
      pagination: {
        currentPage,
        totalPages,
        totalRecords: totalCount,
        limit,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
