import { AnySchema, ValidationError } from 'joi';

export const validateRequest = async <T>(
  data: T,
  schema: AnySchema
): Promise<T> => {
  try {
    return await schema.validateAsync(data, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch (error) {
    throw error;
  }
};
