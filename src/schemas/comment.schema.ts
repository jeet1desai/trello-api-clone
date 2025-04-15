import Joi from 'joi';

export const commentSchema = Joi.object({
  comment: Joi.string().required().trim().messages({
    'string.empty': 'Comment is required',
    'any.required': 'Comment is required',
  }),
  task_id: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
});
