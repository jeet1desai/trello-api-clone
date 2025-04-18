import express from 'express';
import { COOKIE_OPTIONS, TOKEN_EXP } from '../config/app.config';
import jwt, { SignOptions } from 'jsonwebtoken';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import User from '../model/user.model';

type GenerateJwtTokenType = {
  data: string | object | Buffer;
  expires?: string;
};

const jwtVerify = (token: string) => {
  return jwt.verify(token, process.env.TOKEN_PRIVATE_KEY as string);
};

const generateJwtToken = ({ data, expires }: GenerateJwtTokenType) => {
  const options: SignOptions = {};

  if (expires) {
    options.expiresIn = expires as SignOptions['expiresIn'];
  }

  return jwt.sign(data, process.env.TOKEN_PRIVATE_KEY as string, options);
};

const refetchToken = async (token: string) => {
  const decoded: any = jwtVerify(token);
  if (!decoded) throw { status: 401, message: 'Invalid refresh token' };

  const { _id, email } = decoded;
  const tokenData = { data: { _id, email }, expires: TOKEN_EXP.access_token };

  const newAccessToken = generateJwtToken(tokenData);
  return { accessToken: newAccessToken, _id, email };
};

export default async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const accessToken = req?.cookies?.access_token || '';
  const refreshToken = req?.cookies?.refresh_token || '';

  try {
    if (!accessToken) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'No auth token provided', null);
      return;
    }

    const decoded: any = jwtVerify(accessToken);
    if (!decoded) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'Invalid access token', null);
      return;
    }

    const { _id } = decoded;
    const user = await User.findById(_id);
    if (!user) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'Un-authorized', null);
      return;
    }

    // @ts-expect-error
    req.user = user;
    return next();
  } catch (err: any) {
    try {
      if (err.message.includes('jwt expired') && accessToken.length < 500 && refreshToken) {
        // re generate access token
        const { accessToken: newAccessToken, _id } = await refetchToken(refreshToken).catch((err) => {
          throw err;
        });

        const user = await User.findById(_id);
        if (!user) {
          APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'Un-authorized', null);
          return;
        }
        res.cookie('access_token', newAccessToken, COOKIE_OPTIONS);

        // @ts-expect-error
        req.user = user;
        return next();
      } else if (err.message.includes('Token used too late')) {
        APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'Un-authorized', null);
        return;
      } else if (err.message.includes('jwt expired')) {
        APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'jwt expired', null);
        return;
      } else {
        console.error(err);
        next(err);
      }
    } catch (err: any) {
      try {
        if (err.message.includes('Token used too late')) {
          APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'Un-authorized', null);
          return;
        } else if (err.message.includes('jwt expired')) {
          APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'Un-authorized', null);
          return;
        } else {
          console.error(err);
          next(err);
        }
      } catch (err: any) {
        console.error(err);
        next(err);
      }
    }
  }
};
