import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import User from '../model/user.model';
import bcryptJS from 'bcryptjs';
import { HttpStatusCode } from '../helper/enum';
import { validateRequest } from '../utils/validation.utils';
import { loginSchema, refreshTokenSchema, signupSchema } from '../schemas/auth.schema';
import Joi from 'joi';
import generateTokens from '../utils/generateTokens';
import verifyRefreshToken, { VerifyRefreshTokenResponse } from '../utils/verifyRefreshToken';
import jwt from 'jsonwebtoken';
import { accessTokenExpireTime, emailVeirficationTokenExpireTime } from '../helper/constant';
import { sendEmail } from '../utils/sendEmail';
const ejs = require('ejs');

const Signup: RequestHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    await validateRequest(request.body, signupSchema);
    const reqBody = await request.body;
    const { password, email } = reqBody;
    const user = await User.findOne({ email });

    if (user) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'User already exists..!');
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
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Something went wrong..!');
      return;
    }
    const token = jwt.sign({ userId: userCreated._id }, process.env.EMAIL_VERIFY_TOKEN!, {
      expiresIn: emailVeirficationTokenExpireTime,
    });
    userCreated.email_token = token;
    userCreated.email_token_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await userCreated.save();

    const verifyUrl = `https://board-camp-fusion.lovable.app/?token=${token}`;
    const templatePath = __dirname + '/../helper/email-templates/verifyEmail.ejs';
    const html = await ejs.renderFile(templatePath, { link: verifyUrl });

    const mailOptions = {
      to: email,
      subject: 'Verify you email',
      html,
    };

    await sendEmail(mailOptions);

    APIResponse(response, true, HttpStatusCode.CREATED, 'User successfully registered..!');
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

const Signin: RequestHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const reqBody = await request.body;
    await validateRequest(reqBody, loginSchema);
    const { password, email } = reqBody;
    const user = await User.findOne({ email });

    if (!user) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'User not found..!');
      return;
    }

    if (!user.status) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'The user has not verified their email..!');
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
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

const RefreshToken: RequestHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const reqBody = await request.body;
    await validateRequest(reqBody, refreshTokenSchema);
    const verifyToken: VerifyRefreshTokenResponse = await verifyRefreshToken(reqBody.refreshToken);
    const payload = {
      _id: verifyToken.tokenDetails._id,
      email: verifyToken.tokenDetails.email,
    };
    const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_PRIVATE_KEY as string, { expiresIn: accessTokenExpireTime });
    APIResponse(response, true, 200, 'Access token created successfully', {
      accessToken,
    });
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

export const VerifyEmail: RequestHandler = async (request: Request, response: Response): Promise<void> => {
  const { token } = request.body;

  try {
    const decoded: any = jwt.verify(token, process.env.EMAIL_VERIFY_TOKEN as string);
    const user = await User.findById(decoded.userId);

    if (!user) {
      APIResponse(response, false, HttpStatusCode.NOT_FOUND, 'User not found..!');
      return;
    }

    if (user.email_token !== token) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Invalid or used token..!');
      return;
    }

    user.is_email_verified = true;
    user.status = true;
    user.email_token = null;
    user.email_token_expires_at = null;
    await user.save();

    APIResponse(response, true, HttpStatusCode.OK, 'Email verified successfully..!');
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      const decoded: any = jwt.decode(token);

      if (!decoded || !decoded.userId) {
        APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Invalid expired token..!');
        return;
      }

      const user = await User.findById(decoded.userId);

      if (user.email_token !== token) {
        APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Invalid or used token..!');
        return;
      }

      const newToken = jwt.sign({ userId: user._id }, process.env.EMAIL_VERIFY_TOKEN!, {
        expiresIn: emailVeirficationTokenExpireTime,
      });

      user.email_token = newToken;
      user.email_token_expires_at = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      const verifyUrl = `https://board-camp-fusion.lovable.app/?token=${newToken}`;
      const templatePath = __dirname + '/../helper/email-templates/verifyEmail.ejs';
      const html = await ejs.renderFile(templatePath, { link: verifyUrl });

      await sendEmail({
        to: user.email,
        subject: 'Your new verification link',
        html,
      });

      APIResponse(response, true, HttpStatusCode.OK, 'Token expired. New verification link sent..!');
      return;
    }
    APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Invalid token...!');
    return;
  }
};

export default { Signup, Signin, RefreshToken, VerifyEmail };
