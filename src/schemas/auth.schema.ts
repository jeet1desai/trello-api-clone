import Joi from 'joi';

export const signupSchema = Joi.object({
  first_name: Joi.string().required().trim().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
  }),
  middle_name: Joi.string().required().trim().messages({
    'string.empty': 'Middle name is required',
    'any.required': 'Middle name is required',
  }),
  last_name: Joi.string().required().trim().messages({
    'string.empty': 'Last name is required',
    'any.required': 'Last name is required',
  }),
  email: Joi.string().email().required().trim().lowercase().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});
