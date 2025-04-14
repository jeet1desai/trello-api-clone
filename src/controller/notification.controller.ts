import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { NotificationModel } from '../model/notification.model';

export const getNotificationListController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;

    const notifications = await NotificationModel.find({ receiver: user._id })
      .sort({ createdAt: -1 }) // Latest first
      .populate('sender', 'first_name last_name email');

    APIResponse(res, true, HttpStatusCode.OK, 'Notification successfully fetched', notifications);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
