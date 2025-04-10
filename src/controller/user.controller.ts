import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import User from '../model/user.model';

export const getUserProfileHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;
    const userData = await User.findById({ _id: user._id }).select('_id first_name middle_name last_name email profile_image status');
    APIResponse(res, true, HttpStatusCode.OK, 'User profile successfully fetched', userData);
    return;
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
      return;
    }
  }
};

export const updateUserProfileHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const { _id } = req?.user;
    const { first_name, middle_name, last_name, profile_image } = req.body;

    const users = await User.findByIdAndUpdate(
      { _id },
      { first_name, middle_name, last_name, profile_image },
      { runValidators: true, returnDocument: 'after' }
    ).select('_id first_name middle_name last_name email profile_image status');

    if (!users) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'User not found', req.body);
      return;
    }

    APIResponse(res, true, HttpStatusCode.OK, 'User profile successfully updated', users);
    return;
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
      return;
    }
  }
};
