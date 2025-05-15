import Joi from 'joi';

export const signupSchema = Joi.object({
  first_name: Joi.string().required().trim().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
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

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'string.empty': 'Refresh token is required',
    'any.required': 'Refresh token is required',
  }),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
});

export const changePasswordSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
  otp: Joi.string().required().messages({
    'string.empty': 'OTP is required',
    'any.required': 'OTP is required',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});

export const resetPasswordSchema = Joi.object({
  old_password: Joi.string().required().messages({
    'string.empty': 'Old password is required',
    'any.required': 'Old password is required',
  }),
  new_password: Joi.string().required().messages({
    'string.empty': 'New password is required',
    'any.required': 'New password is required',
  }),
});
