import { celebrate, Joi, Segments } from 'celebrate';

export const validateCreateWorkspace = celebrate({
  [Segments.BODY]: Joi.object().keys({
    name: Joi.string().min(1).required().messages({
      'string.empty': `Workspace name is required`,
      'any.required': `Workspace name is required`,
    }),
    description: Joi.string().allow('').optional(),
  }),
});
