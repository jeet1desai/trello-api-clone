import { AnySchema, ValidationError as JoiValidationError } from 'joi';
import { ValidationError } from './error-handler';

export const validateRequest = async <T>(data: T, schema: AnySchema): Promise<T> => {
  try {
    return await schema.validateAsync(data, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch (error) {
    if (error instanceof JoiValidationError) {
      const errors: Record<string, string> = {};
      for (const detail of error.details) {
        const field = detail.path.join('.');
        errors[field] = detail.message;
      }
      throw new ValidationError(errors);
    }
    throw error;
  }
};
