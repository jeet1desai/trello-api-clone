import Joi from 'joi';

export const createTaskSchema = Joi.object({
  title: Joi.string().required().trim().messages({
    'string.empty': 'Title is required',
    'any.required': 'Title is required',
  }),
  board_id: Joi.string().required().trim().messages({
    'string.empty': 'Board id is required',
    'any.required': 'Board id is required',
  }),
  status_list_id: Joi.string().required().trim().messages({
    'string.empty': 'Status id is required',
    'any.required': 'Status id is required',
  }),
});
