import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import User from '../model/user.model';
import { WorkSpaceModel } from '../model/workspace.model';
import { BoardModel } from '../model/board.model';
import { TaskModel } from '../model/task.model';
import dayjs from 'dayjs';

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

    const today = dayjs();

    // Generate last 7 days including today
    const days = Array.from({ length: 7 }, (_, i) => today.subtract(6 - i, 'day'));

    const last7Days = await Promise.all(
      days.map(async (day) => {
        const start = day.startOf('day').toDate();
        const end = day.endOf('day').toDate();

        const count = await TaskModel.countDocuments({
          created_by: user._id,
          createdAt: { $gte: start, $lte: end },
        });

        const boardCount = await BoardModel.countDocuments({
          createdBy: user._id,
          createdAt: { $gte: start, $lte: end },
        });

        return {
          date: day.format('YYYY-MM-DD'),
          task: count,
          board: boardCount,
        };
      })
    );

    const now = dayjs();
    const startOfWeek = now.startOf('week').toDate();
    const startOfMonth = now.startOf('month').toDate();
    const startOfYear = now.startOf('year').toDate();

    // Example: Count tasks created within timeframes
    const [weekCount, monthCount, yearCount] = await Promise.all([
      TaskModel.countDocuments({ created_by: user._id, createdAt: { $gte: startOfWeek } }),
      TaskModel.countDocuments({ created_by: user._id, createdAt: { $gte: startOfMonth } }),
      TaskModel.countDocuments({ created_by: user._id, createdAt: { $gte: startOfYear } }),
    ]);

    const [boardWeekCount, boardMonthCount, boardYearCount] = await Promise.all([
      BoardModel.countDocuments({ createdBy: user._id, createdAt: { $gte: startOfWeek } }),
      BoardModel.countDocuments({ createdBy: user._id, createdAt: { $gte: startOfMonth } }),
      BoardModel.countDocuments({ createdBy: user._id, createdAt: { $gte: startOfYear } }),
    ]);

    const countData = {
      week: last7Days,
      tasks: {
        thisWeek: weekCount,
        thisMonth: monthCount,
        thisYear: yearCount,
      },
      boards: {
        thisWeek: boardWeekCount,
        thisMonth: boardMonthCount,
        thisYear: boardYearCount,
      },
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
