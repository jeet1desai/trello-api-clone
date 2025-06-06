import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { RecentActivityModel } from '../model/recentactivity.model';
import { getPagination } from '../utils/pagination';
import mongoose from 'mongoose';

export const getUserRecentActivitiesHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;

    const { skip, limit, page } = getPagination(req.query);

    const query = {
      $or: [{ created_by: user._id }, { visible_to: user._id }],
    };

    const [activities, total] = await Promise.all([
      RecentActivityModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate({
        path: 'created_by',
        select: '_id first_name middle_name last_name email profile_image',
      }),
      RecentActivityModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    APIResponse(res, true, HttpStatusCode.OK, 'Recent activities fetched', {
      activities: activities,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: total,
        limit,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getUserActivitiesByUserIdHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { userId, boardId } = req.params;
    const { skip, limit, page } = getPagination(req.query);

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(boardId)) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid IDs provided');
      return;
    }

    const query = {
      $and: [{ created_by: userId }, { board: boardId }],
    };

    const [activities, total] = await Promise.all([
      RecentActivityModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'created_by',
          select: '_id first_name middle_name last_name email profile_image',
        })
        .populate({
          path: 'board',
          select: '_id name',
        })
        .populate({
          path: 'task',
          select: '_id title',
        }),
      RecentActivityModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    APIResponse(res, true, HttpStatusCode.OK, 'User activities fetched successfully', {
      activities,
      pagination: { currentPage: page, totalPages, totalRecords: total, limit },
    });
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Failed to fetch user activities');
    }
  }
};
