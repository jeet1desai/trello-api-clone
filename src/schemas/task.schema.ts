import Joi from 'joi';

export const duplicateTaskSchema = Joi.object({
  taskId: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
});

export const importTaskSchema = Joi.object({
  board_id: Joi.string().required().trim().messages({
    'string.empty': 'Board id is required',
    'any.required': 'Board id is required',
  }),
});

export const getTaskSuggestionsSchema = Joi.object({
  boardId: Joi.string().required().trim().messages({
    'string.empty': 'Board id is required',
    'any.required': 'Board id is required',
  }),
  taskId: Joi.string().optional().trim(),
});

export const repeatTaskSchema = Joi.object({
  taskId: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
  repeat_type: Joi.string().valid('daily', 'weekly', 'monthly').required().messages({
    'any.only': 'Repeat type must be one of daily, weekly, or monthly',
    'any.required': 'Repeat type is required',
  }),

  start_date: Joi.date().required().messages({
    'date.base': 'Start date must be a valid date',
    'any.required': 'Start date is required',
  }),

  end_date: Joi.date().greater(Joi.ref('start_date')).required().messages({
    'date.base': 'End date must be a valid date',
    'date.greater': 'End date must be after start date',
    'any.required': 'End date is required',
  }),
});

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
  task_type: Joi.string().valid('FEATURE', 'SUBTASK', 'BUG').optional().messages({
    'any.only': 'Task type must be one of FEATURE, SUBTASK, or BUG',
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

export const addEstimatedTimeSchema = Joi.object({
  task_id: Joi.string().required().trim().messages({
    'string.empty': 'Task id is required',
    'any.required': 'Task id is required',
  }),
  hours: Joi.number().required().min(0).messages({
    'number.empty': 'Hours is required',
    'any.required': 'Hours is required',
    'number.min': 'Hours must be greater than or equal to 0',
  }),
  minutes: Joi.number().required().min(0).max(59).messages({
    'number.empty': 'Minutes is required',
    'any.required': 'Minutes is required',
    'number.min': 'Minutes must be greater than or equal to 0',
    'number.max': 'Minutes must be less than or equal to 59',
  }),
});
