import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import User from '../model/user.model';
import { deleteFromCloudinary, saveFileToCloud } from '../utils/cloudinaryFileUpload';

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

export const updateUserProfileHandler = async (req: any, res: express.Response, next: express.NextFunction) => {
  try {
    const { _id, profile_image } = req?.user;
    const { first_name, middle_name, last_name } = req.body;
    const profileImage = req.file;
    if (profileImage && profile_image && profile_image?.imageId) {
      await deleteFromCloudinary(profile_image?.imageId);
    }
    let imageRes = {};
    if (profileImage) {
      imageRes = await saveFileToCloud(profileImage, 'profile');
    }

    const users = await User.findByIdAndUpdate(
      { _id },
      { first_name, middle_name, last_name, profile_image: profileImage ? imageRes : profile_image },
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
