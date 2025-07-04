import { StatusCodes } from 'http-status-codes';

export interface CustomError {
  message: string;
  status: string;
  statusCode: number;
  errors?: any[];
}

export class ValidationError extends Error {
  statusCode: number;
  errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super('Validation Failed');
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export const duplicateError = (message: string): CustomError => ({
  message,
  status: 'error',
  statusCode: StatusCodes.CONFLICT,
});

export const notFoundError = (message: string): CustomError => ({
  message,
  status: 'error',
  statusCode: StatusCodes.NOT_FOUND,
});

export const unauthorizedError = (message: string): CustomError => ({
  message,
  status: 'error',
  statusCode: StatusCodes.UNAUTHORIZED,
});

export const badRequestError = (message: string): CustomError => ({
  message,
  status: 'error',
  statusCode: StatusCodes.BAD_REQUEST,
});

export const validationError = (message: string, errors: any[]): CustomError => ({
  message,
  status: 'error',
  statusCode: StatusCodes.BAD_REQUEST,
  errors,
});

export const isCustomError = (error: unknown): error is CustomError => {
  return typeof error === 'object' && error !== null && 'message' in error && 'status' in error && 'statusCode' in error;
};
