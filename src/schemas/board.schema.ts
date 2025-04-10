import Joi from 'joi';
import { MEMBER_INVITE_STATUS } from '../config/app.config';

export const createBoardSchema = Joi.object({
  name: Joi.string().required().trim().messages({
    'string.empty': 'Board name is required',
    'any.required': 'Board name is required',
  }),
  description: Joi.string().allow('').optional(),
  workspace: Joi.string().required().messages({
    'string.empty': 'Workspace is required',
    'any.required': 'Workspace is required',
  }),
  members: Joi.array()
    .items(
      Joi.string().email().optional().messages({
        'string.email': 'Each member must be a valid email',
      })
    )
    .optional()
    .min(0),
});

export const updateInvitationSchema = Joi.object({
  status: Joi.string().valid(MEMBER_INVITE_STATUS.COMPLETED, MEMBER_INVITE_STATUS.REJECTED).required().trim().messages({
    'string.empty': 'Status is required',
    'any.required': 'Status is required',
    'any.only': 'Status must be one of COMPLETED or REJECTED',
  }),
});
