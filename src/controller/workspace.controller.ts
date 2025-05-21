import express from 'express';
import { WorkSpaceModel, WorkspaceModelType } from '../model/workspace.model';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import { createWorkspaceSchema } from '../schemas/workspace.schema';
import { getSortOption, MEMBER_ROLES, SORT_TYPE } from '../config/app.config';
import { MemberModel } from '../model/members.model';
import { decrypt, encrypt } from '../helper/encryptionUtils';
import { saveRecentActivity } from '../helper/recentActivityService';
import { BoardModel } from '../model/board.model';
import { getWorkspaceBoardsQuery } from './board.controller';
import { FilterQuery } from 'mongoose';
import { getPagination } from '../utils/pagination';

export const createWorkSpaceController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const encrypted = req.body;
    const decrypted = decrypt(encrypted);

    await validateRequest(decrypted, createWorkspaceSchema);

    const { name, description } = decrypted;
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
    let workspace = await WorkSpaceModel.findById({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    if (workspace.createdBy.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to perform this task');
      return;
    }

    workspace = await WorkSpaceModel.findByIdAndUpdate({ _id: id }, { name, description }, { runValidators: true, returnDocument: 'after' });

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
    let workspace = await WorkSpaceModel.findById({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }
    if (workspace.createdBy.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to perform this task', req.body);
      return;
    }
    if (boards[0]?.total > 0) {
      APIResponse(
        res,
        false,
        HttpStatusCode.UNPROCESSABLE_ENTITY,
        'This workspace cannot be deleted until all related boards are removed.',
        req.body
      );
      return;
    }
    workspace = await WorkSpaceModel.findByIdAndDelete({ _id: id });
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
    // @ts-expect-error
    const user = req.user;
    const { id } = req.params;

    const workspace: any = await WorkSpaceModel.findById({ _id: id }).populate('createdBy', 'first_name last_name email');

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    if (user._id.toString() === workspace.createdBy._id?.toString()) {
      APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully fetched', workspace);
    } else {
      APIResponse(res, true, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to view this workspace');
    }
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
    const { page = '1', perPage = '12', search = '', sortType } = req?.query || {};

    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(perPage) || 12;

    const {
      skip,
      limit,
      page: currentPage,
    } = getPagination({
      page: parsedPage,
      limit: parsedLimit,
    });

    const sortOption = getSortOption(parseInt(sortType as string) || SORT_TYPE.CreatedDateDesc);

    // 2. Find workspaces where user is creator
    const filters: FilterQuery<WorkspaceModelType> = {
      $and: [
        {
          $or: [{ createdBy: user._id }],
        },
      ],
    };

    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex special chars
    const safeSearch = escapeRegex(search as string);
    if (safeSearch) {
      filters.name = { $regex: safeSearch, $options: 'i' };
    }

    // 3. Get total count (for pagination metadata) and fetch workspaces
    const [workspaces, totalCount] = await Promise.all([
      WorkSpaceModel.find(filters).populate('createdBy', 'first_name last_name email').sort(sortOption).skip(skip).limit(limit),
      WorkSpaceModel.countDocuments(filters),
    ]);

    // 4. Get board counts for each workspace
    const workspacesWithBoardCount = await Promise.all(
      workspaces.map(async (workspace) => {
        const boards = await BoardModel.aggregate([...getWorkspaceBoardsQuery(workspace._id.toString(), user._id.toString()), { $count: 'total' }]);

        const count = boards.length > 0 ? boards[0].total : 0;

        return {
          ...workspace.toObject(),
          boards: count,
        };
      })
    );

    const totalPages = Math.ceil(totalCount / limit);

    // 5. Return response
    APIResponse(res, true, HttpStatusCode.OK, 'Workspace successfully fetched', {
      workspaces: workspacesWithBoardCount,
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

export const updateWorkSpaceFavoriteController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;

    const { id } = req.params;
    const { isFavorite } = req.body;

    let workspace = await WorkSpaceModel.findById({ _id: id });

    if (!workspace) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Workspace not found', req.body);
      return;
    }

    if (workspace.createdBy.toString() !== user._id.toString()) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'You are not authorized to perform this task');
      return;
    }

    workspace = await WorkSpaceModel.findByIdAndUpdate({ _id: id }, { isFavorite }, { runValidators: true, returnDocument: 'after' });

    await saveRecentActivity(user._id.toString(), 'Updated', 'Workspace', '', [user?._id.toString()], `${user.first_name} updated workspace`);

    APIResponse(
      res,
      true,
      HttpStatusCode.OK,
      `${isFavorite ? 'Workspace Added to Favorite list' : 'Workspace Removed From Favorite list'}`,
      workspace
    );
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
