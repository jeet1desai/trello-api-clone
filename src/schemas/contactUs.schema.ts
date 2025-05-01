import Joi from 'joi';

export const contactUsSchema = Joi.object({
  name: Joi.string().required().trim().messages({
    'string.empty': 'Name is required',
    'any.required': 'Name is required',
  }),
  email: Joi.string().email().required().trim().lowercase().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
  description: Joi.string().max(200).required().messages({
    'string.max': 'Description must not exceed 200 characters',
    'string.empty': 'Description is required',
    'any.required': 'Description is required',
  }),
});
