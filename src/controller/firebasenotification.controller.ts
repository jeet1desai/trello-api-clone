import { NextFunction, Request, Response } from 'express';
import firebaseAdmin from '../config/firebaseAdmin';
import User from '../model/user.model';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';

export const sendNotification = async (deviceToken: string, title: string, body: string) => {
  const message = {
    notification: { title, body },
    token: deviceToken,
  };

  try {
    const response = await firebaseAdmin.messaging().send(message);
    console.log('Notification sent successfully:', response);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const saveFirebaseDeviceToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fpn_token } = req.body;

    // @ts-expect-error
    const user: User = req?.user;

    if (!fpn_token || !user) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Device token is required');
      return;
    }

    const existingUser = await User.findOne({ _id: user._id });
    if (!existingUser) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'User not found');
      return;
    }

    existingUser.fpn_token = fpn_token;
    await existingUser.save();

    APIResponse(res, true, HttpStatusCode.OK, 'Device token saved successfully');
  } catch (error) {
    APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Failed to save device token');
    return;
  }
};

export const sendNotificationToUsers = async (userIds: string[], title: string, body: string) => {
  const messages = userIds.map((userId) => ({
    notification: {
      title,
      body,
    },
    token: userId,
  }));

  try {
    const responses = await Promise.all(messages.map(async (message) => await firebaseAdmin.messaging().send(message)));
    console.log('Notification sent successfully');
    return responses;
  } catch (error) {
    console.error('Error sending notification:', error);
    return error;
  }
};
