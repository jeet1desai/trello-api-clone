import { Response } from 'express';

const APIResponse = <T>(
  resp: Response,
  status: boolean,
  statusCode: number,
  message: string,
  data?: T | undefined,
  dataEncrypted?: string
) => {
  const response: {
    status: boolean;
    message: string;
    data?: T;
    dataEncrypted?: string;
  } = {
    status,
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
