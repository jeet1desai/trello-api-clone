import Joi from 'joi';

export const createLabelSchema = Joi.object({
  name: Joi.string().required().trim().messages({
    'string.empty': 'Label name is required',
    'any.required': 'Label name is required',
  }),
  background_color: Joi.string().required().trim().messages({
    'string.empty': 'Background color is required',
    'any.required': 'Background color is required',
  }),
  text_color: Joi.string().required().trim().messages({
    'string.empty': 'Text color is required',
    'any.required': 'Text color is required',
  }),
  board: Joi.string().required().trim().messages({
    'string.empty': 'Board id is required',
    'any.required': 'Board id is required',
  }),
});
