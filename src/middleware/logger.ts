import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../utils/error-handler';

export function notFound(req: Request, res: Response, next: NextFunction) {
  res.status(404);
  const error = new Error(`🔍 - Not Found - ${req.originalUrl}`);
  next(error);
}

type CustomError = Error & { errors?: Record<string, string>; statusCode?: number };

export function errorHandler(err: CustomError, req: Request, res: Response, next: NextFunction) {
  const isValidationError = err instanceof ValidationError;
  const responseStatus = res.statusCode !== 200 ? res.statusCode : 500;
  const statusCode = isValidationError ? err.statusCode : responseStatus;

  const response: Record<string, boolean | object | string | number | undefined> = {
    success: false,
    status: statusCode,
    message: err.message || 'Internal Server Error',
  };

  if (isValidationError && err.errors) {
    response.errors = err.errors;
  }

  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
  next();
}
