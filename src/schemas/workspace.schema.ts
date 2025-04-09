import Joi from 'joi';

export const createWorkspaceSchema = Joi.object({
  name: Joi.string().required().trim().messages({
    'string.empty': 'Workspace name is required',
    'any.required': 'Workspace name is required',
  }),
  description: Joi.string().allow('').optional(),
});
