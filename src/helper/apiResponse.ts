import { Response } from 'express';

const APIResponse = <T>(resp: Response, status: boolean, statusCode: number, message: string, data?: T | undefined, dataEncrypted?: string) => {
  const response: { success: boolean; status: number; message: string; data?: T; dataEncrypted?: string } = {
    success: status,
    status: statusCode,
    message,
  };
  if (data) {
    response.data = data;
  }
  if (dataEncrypted) {
    response.dataEncrypted = dataEncrypted;
  }
  return resp.status(statusCode).json(response);
};

export default APIResponse;
