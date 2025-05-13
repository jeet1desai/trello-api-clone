import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { NotificationModel } from '../model/notification.model';

export const getNotificationListController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;

    const notifications = await NotificationModel.find({ receiver: user._id, read: false })
      .sort({ createdAt: -1 })
      .populate('sender', 'first_name last_name email');

    APIResponse(res, true, HttpStatusCode.OK, 'Notification successfully fetched', notifications);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const markNotificationAsReadController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { id } = req.params;

    const notification = await NotificationModel.findById(id);
    if (!notification) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Notification not found');
      return;
    }

    notification.read = true;
    await notification.save();

    APIResponse(res, true, HttpStatusCode.OK, 'Notification marked as read', notification);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const markAllNotificationsAsReadController = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req.user;

    await NotificationModel.updateMany(
      { receiver: user._id, read: false },
      { $set: { read: true } }
    );

    APIResponse(res, true, HttpStatusCode.OK, 'All notifications marked as read');
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};
