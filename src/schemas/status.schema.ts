import Joi from 'joi';

export const createStatusSchema = Joi.object({
  name: Joi.string().required().trim().messages({
    'string.empty': 'Status name is required',
    'any.required': 'Status name is required',
  }),
  description: Joi.string().allow('').optional(),
  board_id: Joi.string().required().trim().messages({
    'string.empty': 'Board id is required',
    'any.required': 'Board id is required',
  }),
});
