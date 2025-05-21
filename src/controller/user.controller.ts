import express from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import User from '../model/user.model';
import { deleteFromCloudinary, saveFileToCloud } from '../utils/cloudinaryFileUpload';
import { saveMultipleFilesToCloud } from '../helper/saveMultipleFiles';
import { UserBoardBackgroundModel } from '../model/userBoardBackground.model';
import { getResourceType } from '../helper/getResourceType';
import { BoardModel } from '../model/board.model';
import { BOARD_BACKGROUND_TYPE } from '../config/app.config';

export const getUserProfileHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const user = req?.user;
    const userData = await User.findById({ _id: user._id }).select(
      '_id first_name middle_name last_name email profile_image status is_password_available'
    );
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

export const getUserBoardBackgroundImages = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // @ts-expect-error
    const userId = req.user?._id;

    const images = await UserBoardBackgroundModel.find({ userId }).lean();

    APIResponse(res, true, HttpStatusCode.OK, 'User Board backgrounds fetched successfully', images);
  } catch (err) {
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err instanceof Error ? err.message : 'Something went wrong');
  }
};

export const uploadCustomBoardImages = async (req: express.Request, res: express.Response) => {
  try {
    const attachments = req.files as Express.Multer.File[];
    // @ts-expect-error
    const userId = req.user._id;

    if (!attachments?.length) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'No files uploaded');
      return;
    }

    const uploadResponse = await saveMultipleFilesToCloud(attachments, 'user_board_backgrounds');

    const boardBackgrounds = uploadResponse.map((result: { imageId: string; imageName: string; url: string }) => ({
      imageId: result.imageId,
      imageUrl: result.url,
      imageName: result.imageName,
      userId,
    }));

    const savedImages = await UserBoardBackgroundModel.insertMany(boardBackgrounds);

    APIResponse(res, true, HttpStatusCode.OK, 'User Board background images uploaded successfully', savedImages);
  } catch (err) {
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err instanceof Error ? err.message : 'Something went wrong');
  }
};

export const deleteUserBoardBackgroundImage = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { imageId, boardId } = req.query;
    // @ts-expect-error
    const userId = req.user?._id;

    if (!imageId) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Image ID is required');
      return;
    }

    const image = await UserBoardBackgroundModel.findOne({ _id: imageId, userId });
    if (!image) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Image not found');
      return;
    }

    const board = await BoardModel.findById(boardId);
    if (!board) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Board not found');
      return;
    }

    if (board.background === image.imageUrl) {
      board.backgroundType = BOARD_BACKGROUND_TYPE.COLOR;
      board.background = '#FFF';
      await board.save();
    }

    const resourceType = await getResourceType(image.imageName);
    await deleteFromCloudinary(image.imageId, resourceType);

    await UserBoardBackgroundModel.deleteOne({ _id: imageId });

    APIResponse(res, true, HttpStatusCode.OK, 'User Board Background Image deleted successfully');
  } catch (err) {
    APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err instanceof Error ? err.message : 'Something went wrong');
  }
};
