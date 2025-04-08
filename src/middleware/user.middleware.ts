import express from 'express';
import { COOKIE_OPTIONS, TOKEN_EXP } from '../config/app.config';
import jwt, { SignOptions } from 'jsonwebtoken';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';

type GenerateJwtTokenType = {
  data: string | object | Buffer;
  expires?: string;
};

const jwtVerify = (token: string) => {
  return jwt.verify(token, process.env.JWT_KEY!);
};

const generateJwtToken = ({ data, expires }: GenerateJwtTokenType) => {
  const options: SignOptions = {};

  if (expires) {
    options.expiresIn = expires as SignOptions['expiresIn'];
  }

  return jwt.sign(data, process.env.JWT_KEY!, options);
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
    console.log(accessToken);

    // if (!accessToken) throw { status: 401, message: 'No auth token provided' };
    if (!accessToken) {
      APIResponse(res, false, HttpStatusCode.UNAUTHORIZED, 'No auth token provided', null);
    }

    console.log('Proceeding with JWT token');

    const decoded: any = jwtVerify(accessToken);

    if (!decoded) throw { status: 401, message: 'Invalid access token' };

    const { _id } = decoded;

    // const user = await findUserById(_id);
    const user = { _id };

    if (!user) throw { status: 401, message: 'Un-authorized' };

    // @ts-expect-error
    req.user = user;

    return next();
  } catch (err: any) {
    // try {
    //   if (err.message.includes('jwt expired') && accessToken.length < 500 && refreshToken) {
    //     // re generate access token
    //     console.log('Re-Fetch Jwt');
    //     const { accessToken: newAccessToken, _id } = await refetchToken(refreshToken).catch((err) => {
    //       throw err;
    //     });
    //     // const userFound = await findUserById(_id);
    //     const user = { _id };
    //     if (!user) throw { status: 401, message: 'Un-authorized' };
    //     res.cookie('access_token', newAccessToken, COOKIE_OPTIONS);
    //     // @ts-expect-error
    //     req.user = user;
    //     return next();
    //   } else if (err.message.includes('Token used too late')) {
    //     throw { status: 401, message: 'Un-authorized' };
    //   } else if (err.message.includes('jwt expired')) {
    //     throw { status: 401, message: 'Un-authorized' };
    //   } else {
    //     console.error(err);
    //     next(err);
    //   }
    // } catch (err: any) {
    //   try {
    //     if (err.message.includes('Token used too late')) throw { status: 401, message: 'Un-authorized' };
    //     else if (err.message.includes('jwt expired')) throw { status: 401, message: 'Un-authorized' };
    //     else {
    //       console.error(err);
    //       next(err);
    //     }
    //   } catch (err: any) {
    //     console.error(err);
    //     next(err);
    //   }
    // }
  }
};
