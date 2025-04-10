import { Response } from 'express';
import { COOKIE_OPTIONS } from '../config/app.config';

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

const sendWithCookie = ({ res, message = 'Ok', status = 200, data }: any) => {
  data.auth = true;
  res.cookie('access_token', data?.accessToken, COOKIE_OPTIONS);
  return res.cookie('refresh_token', data.refreshToken, COOKIE_OPTIONS).status(status).json({
    status,
    message: message,
    data,
  });
};

export default APIResponse;

export { sendWithCookie };
