import { Request, Response, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import Joi from 'joi';
import { validateRequest } from '../utils/validation.utils';
import mongoose from 'mongoose';
import { TaskModel } from '../model/task.model';
import { addTaskLabelSchema } from '../schemas/task.schema';
import { getSocket, users } from '../config/socketio.config';
import { TaskLabelModel } from '../model/taskLabel.model';
import { commentSchema, updateCommentSchema } from '../schemas/comment.schema';
import { CommentModel } from '../model/comment.model';
import { saveMultipleFilesToCloud } from '../helper/saveMultipleFiles';
import { deleteFromCloudinary } from '../utils/cloudinaryFileUpload';

export const addCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await validateRequest(req.body, commentSchema);
    // @ts-expect-error
    const user = req?.user;
    const attachments = req.files as Express.Multer.File[];
    const { comment, task_id } = req.body;
    const taskExist = await TaskModel.findOne({ _id: task_id });

    if (!taskExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Task not found..!');
      return;
    }

    let attachmentsData: any[] = [];

    if (attachments && attachments.length > 0) {
      const uploadResponse = await saveMultipleFilesToCloud(attachments, 'comments');

      attachmentsData = uploadResponse.map((result) => ({
        imageId: result.imageId,
        url: result.url,
        imageName: result.imageName,
      }));
    }

    const newComment = await CommentModel.create({
      comment,
      task_id,
      attachment: attachmentsData,
      commented_by: user._id,
    });

    const { io } = getSocket();
    const socketId = users.get(user._id.toString());
    if (socketId) {
      io?.to(socketId).emit('receive_comment', { data: newComment });
    } else {
      console.warn(`No socket connection found for user: ${user._id.toString()}`);
    }

    APIResponse(res, true, HttpStatusCode.CREATED, 'Comment successfully added', newComment);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const getCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const comments = await CommentModel.find({ task_id: taskId })
      .populate({
        path: 'task_id',
        select: '_id title description board_id status_list_id position position',
      })
      .populate({
        path: 'commented_by',
        select: '_id first_name middle_name last_name email profile_image status',
      });

    APIResponse(res, true, HttpStatusCode.OK, 'Comment successfully fetched', comments);
  } catch (err) {
    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const deleteCommentHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const taskLabelExist = await CommentModel.findOne({ _id: id });
    if (!taskLabelExist) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Comment not found..!');
      return;
    }
    if (taskLabelExist.attachment.length > 0) {
      taskLabelExist.attachment.forEach(async (item) => {
        await deleteFromCloudinary(item.imageId);
      });
    }
    const taskLabel = await CommentModel.findByIdAndDelete({ _id: id }, { session });

    await session.commitTransaction();
    session.endSession();
    APIResponse(res, true, HttpStatusCode.OK, 'Comment successfully removed', taskLabel);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.BAD_GATEWAY, err.message);
    }
  }
};

export const updateCommentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await validateRequest(req.body, updateCommentSchema);

    const { id } = req.params;
    const { comment } = req.body;
    const newFiles = req.files as Express.Multer.File[];
    // @ts-expect-error
    const user = req?.user;

    let deletedAttachments: string[] = [];
    try {
      if (req.body.deletedAttachments) {
        deletedAttachments = JSON.parse(req.body.deletedAttachments);
        if (!Array.isArray(deletedAttachments)) {
          throw new Error();
        }
      }
    } catch {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, 'Invalid deletedAttachments format. Expected JSON array of image IDs');
      return;
    }

    const existingComment = await CommentModel.findById(id);
    if (!existingComment) {
      APIResponse(res, false, HttpStatusCode.NOT_FOUND, 'Comment not found');
      return;
    }

    // chekc delete attachment has value or not
    if (deletedAttachments.length > 0) {
      const missingIds = deletedAttachments.filter((imgId) => !existingComment.attachment.some((att) => att.imageId === imgId));
      if (missingIds.length > 0) {
        APIResponse(res, false, HttpStatusCode.BAD_REQUEST, `Attachments not found: ${missingIds.join(', ')}`);
        return;
      }
    }

    // Add new attachmnet
    let newAttachments: any[] = [];
    if (newFiles?.length > 0) {
      try {
        const uploadResults = await saveMultipleFilesToCloud(newFiles, 'comments');
        newAttachments = uploadResults.map(({ imageId, url, imageName }) => ({
          imageId,
          url,
          imageName,
        }));
      } catch {
        APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Failed to upload new attachments');
        return;
      }
    }

    const session = await mongoose.startSession();

    //  Apply $set (comment) and $pull (deletions)
    const updateStage1: any = {};
    if (comment) {
      updateStage1.$set = { comment };
    }
    if (deletedAttachments.length > 0) {
      updateStage1.$pull = {
        attachment: { imageId: { $in: deletedAttachments } },
      };
    }

    if (Object.keys(updateStage1).length > 0) {
      await CommentModel.findByIdAndUpdate(id, updateStage1, {
        new: false,
        runValidators: true,
        session,
      });
    }

    //  Apply $push (add new attachments)
    if (newAttachments.length > 0) {
      await CommentModel.findByIdAndUpdate(
        id,
        {
          $push: { attachment: { $each: newAttachments } },
        },
        {
          new: false,
          runValidators: true,
          session,
        }
      );
    }

    const updatedComment = await CommentModel.findById(id).lean();

    // delete attachment from cloudinary
    if (deletedAttachments.length > 0) {
      await Promise.all(deletedAttachments.map((imageId) => deleteFromCloudinary(imageId)));
    }

    // Emit socket update
    const { io } = getSocket();
    const socketId = users.get(user._id.toString());
    if (socketId && io) {
      io.to(socketId).emit('receive_updated_comment', { data: updatedComment });
    }

    APIResponse(res, true, HttpStatusCode.OK, 'Comment successfully updated', updatedComment);
  } catch (err) {
    if (err instanceof Joi.ValidationError) {
      APIResponse(res, false, HttpStatusCode.BAD_REQUEST, err.details[0].message);
    } else if (err instanceof Error) {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, err.message);
    } else {
      APIResponse(res, false, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Unknown error occurred');
    }
  }
};
