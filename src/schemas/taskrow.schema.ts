import Joi from 'joi';

export const taskRowSchema = Joi.object({
  title: Joi.string().required().messages({
    'any.required': 'Title is required',
    'string.empty': 'Title cannot be empty',
  }),
  status: Joi.string().required().messages({
    'any.required': 'Status is required',
    'string.empty': 'Status cannot be empty',
  }),
});
