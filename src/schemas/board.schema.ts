import Joi from 'joi';

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
