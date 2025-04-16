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

export const addTaskMemberSchema = Joi.object({
  task_id: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
  member_id: Joi.string().required().trim().messages({
    'string.empty': 'Member id is required',
    'any.required': 'Member id is required',
  }),
});

export const addTaskLabelSchema = Joi.object({
  task_id: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
  label_id: Joi.string().required().trim().messages({
    'string.empty': 'Label id is required',
    'any.required': 'Label id is required',
  }),
});

export const attachmentSchema = Joi.object({
  task_id: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
});
