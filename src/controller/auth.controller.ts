import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import User from '../model/user.model';
import bcryptJS from 'bcryptjs';
import { HttpStatusCode } from '../helper/enum';
import { validateRequest } from '../utils/validation.utils';
import {
  loginSchema,
  refreshTokenSchema,
  signupSchema,
} from '../schemas/auth.schema';
import Joi from 'joi';
import generateTokens from '../utils/generateTokens';
import verifyRefreshToken, {
  VerifyRefreshTokenResponse,
} from '../utils/verifyRefreshToken';
import jwt from 'jsonwebtoken';
import { accessTokenExpireTime } from '../helper/constant';
import { sendEmail } from '../utils/sendEmail';

const Signup: RequestHandler = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await validateRequest(request.body, signupSchema);
    const reqBody = await request.body;
    const { password, email } = reqBody;
    const user = await User.findOne({ email });

    if (user) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_REQUEST,
        'User already exists..!'
      );
      return;
    }
    const salt = await bcryptJS.genSalt(10);
    const hashedPassword = await bcryptJS.hash(password, salt);
    const newUser = {
      ...reqBody,
      password: hashedPassword,
    };
    const userCreated = await User.create(newUser);
    if (!userCreated) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_REQUEST,
        'Something went wrong..!'
      );
      return;
    }

    const mailOptions = {
      to: email,
      subject: 'Verify you email',
      html: 'please verfy your email',
    };

    await sendEmail(mailOptions);

    APIResponse(
      response,
      true,
      HttpStatusCode.CREATED,
      'User successfully registered..!',
      userCreated
    );
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    } else {
      return next(error);
    }
  }
};

const Signin: RequestHandler = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reqBody = await request.body;
    await validateRequest(reqBody, loginSchema);
    const { password, email } = reqBody;
    const user = await User.findOne({ email });

    if (!user) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_REQUEST,
        'User not found..!'
      );
      return;
    }
    const validatePassword = await bcryptJS.compare(password, user.password);

    if (!validatePassword) {
      APIResponse(response, false, 401, 'Invalid username or password..!');
      return;
    }

    const tokenData = {
      id: user._id,
      email: user.email,
    };

    const { accessToken, refreshToken } = await generateTokens(tokenData);

    APIResponse(response, true, 200, 'Login successfull..!', {
      user,
      accessToken,
      refreshToken,
    });
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    } else {
      return next(error);
    }
  }
};

const RefreshToken: RequestHandler = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reqBody = await request.body;
    await validateRequest(reqBody, refreshTokenSchema);
    const verifyToken: VerifyRefreshTokenResponse = await verifyRefreshToken(
      reqBody.refreshToken
    );
    const payload = {
      _id: verifyToken.tokenDetails._id,
      email: verifyToken.tokenDetails.email,
    };
    const accessToken = jwt.sign(
      payload,
      process.env.ACCESS_TOKEN_PRIVATE_KEY as string,
      { expiresIn: accessTokenExpireTime }
    );
    APIResponse(response, true, 200, 'Access token created successfully', {
      accessToken,
    });
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_REQUEST,
        error.details[0].message
      );
    } else {
      return next(error);
    }
  }
};

export default { Signup, Signin, RefreshToken };
