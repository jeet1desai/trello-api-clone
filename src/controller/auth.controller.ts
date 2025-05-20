import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse, { sendWithCookie } from '../helper/apiResponse';
import User from '../model/user.model';
import bcryptJS from 'bcryptjs';
import { HttpStatusCode } from '../helper/enum';
import { validateRequest } from '../utils/validation.utils';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  resetPasswordSchemaForSocialMediaUser,
  signupSchema,
} from '../schemas/auth.schema';
import Joi from 'joi';
import generateTokens from '../utils/generateTokens';
import verifyRefreshToken, { VerifyRefreshTokenResponse } from '../utils/verifyRefreshToken';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/sendEmail';
import ejs from 'ejs';
import { COOKIE_OPTIONS, TOKEN_EXP } from '../config/app.config';
import { saveFileToCloud } from '../utils/cloudinaryFileUpload';
import admin from '../config/firebaseAdmin';

export interface IUserInfo {
  first_name: string;
  email?: string;
  profile_image: string;
  status: boolean;
  is_email_verified?: boolean;
  provider: string;
}

const providerNameMap: Record<string, string> = {
  'google.com': 'Google',
  'github.com': 'GitHub',
  'base-app-user': 'Email/Password',
};

const Signup: RequestHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    await validateRequest(request.body, signupSchema);
    const reqBody = await request.body;
    const profileImage = request.file;
    const { password, email } = reqBody;
    const user = await User.findOne({ email });

    if (user) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'User already exists..!');
      return;
    }

    let imageRes = {};
    if (profileImage) {
      imageRes = await saveFileToCloud(profileImage, 'profile');
    }

    const salt = await bcryptJS.genSalt(10);
    const hashedPassword = await bcryptJS.hash(password, salt);
    const newUser = {
      ...reqBody,
      password: hashedPassword,
      profile_image: imageRes,
    };
    const userCreated = await User.create(newUser);
    if (!userCreated) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Something went wrong..!');
      return;
    }
    const token = jwt.sign({ userId: userCreated._id }, process.env.EMAIL_VERIFY_TOKEN!, {
      expiresIn: TOKEN_EXP.email_token as any,
    });
    userCreated.email_token = token;
    userCreated.email_token_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await userCreated.save();

    const verifyUrl = `${process.env.FE_URL}/?token=${token}`;
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

    const userData = {
      _id: user._id,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      email: user.email,
      profile_image: user.profile_image,
      status: user.status,
      is_password_available: user.is_password_available,
    };

    const { accessToken, refreshToken } = await generateTokens(tokenData);

    sendWithCookie({ res: response, message: 'Login successful..!', status: 200, data: { user: userData, accessToken, refreshToken } });
    return;
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

    const accessToken = jwt.sign(payload, process.env.TOKEN_PRIVATE_KEY as string, { expiresIn: TOKEN_EXP.access_token as any });
    const user = await User.findById({ _id: verifyToken.tokenDetails._id }).select('_id first_name middle_name last_name email profile_image status');

    sendWithCookie({
      res: response,
      message: 'Access token created successfully',
      status: 200,
      data: { user, accessToken, refreshToken: reqBody.refreshToken },
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
    return;
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
        expiresIn: TOKEN_EXP.email_token as any,
      });

      user.email_token = newToken;
      user.email_token_expires_at = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      const verifyUrl = `${process.env.FE_URL}/?token=${newToken}`;
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

const ForgotPassword: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const reqBody = await request.body;
    await validateRequest(reqBody, forgotPasswordSchema);
    const { email } = reqBody;
    const user = await User.findOne({ email });

    if (!user) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'User not found..!');
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const templatePath = __dirname + '/../helper/email-templates/sendOTP.ejs';
    const html = await ejs.renderFile(templatePath, { otp });

    const mailOptions = {
      to: email,
      subject: 'OTP verification',
      html,
    };
    user.otp = otp;
    user.otp_expire = new Date(Date.now() + 3 * 60 * 1000);
    user.save();
    await sendEmail(mailOptions);
    APIResponse(response, true, HttpStatusCode.OK, 'We have sent you otp to your email..!');
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

const ChangePassword: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const reqBody = await request.body;
    await validateRequest(reqBody, changePasswordSchema);
    const { email, otp, password } = reqBody;
    const user = await User.findOne({ email });

    if (!user) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'User not found..!');
      return;
    }

    if (!user.otp || !user.otp_expire || new Date() > user.otp_expire) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'OTP has expired. Please request a new one..!');
      return;
    }

    if (user.otp !== otp) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Invalid OTP..!');
      return;
    }

    const salt = await bcryptJS.genSalt(10);
    const hashedPassword = await bcryptJS.hash(password, salt);

    user.password = hashedPassword;
    user.otp = null;
    user.otp_expire = null;
    await user.save();

    APIResponse(response, true, HttpStatusCode.OK, 'New password successfully updated..!');
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

const ResetPassword: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const reqBody = await request.body;
    const { old_password, new_password } = reqBody;
    const user = (request as any)?.user;
    await validateRequest(reqBody, user.password ? resetPasswordSchema : resetPasswordSchemaForSocialMediaUser);
    if (!user) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'User not found..!');
      return;
    }

    if (user.password) {
      const validateOldPassword = await bcryptJS.compare(old_password, user.password);
      if (!validateOldPassword) {
        APIResponse(response, false, 401, 'Incorrect old password. If you forgot your current password, please use the "Forgot Password" option..!');
        return;
      }
    }

    const salt = await bcryptJS.genSalt(10);
    const hashedPassword = await bcryptJS.hash(new_password, salt);

    const newuser = await User.findByIdAndUpdate(
      { _id: user._id },
      { password: hashedPassword, is_password_available: true },
      { runValidators: true, returnDocument: 'after' }
    );

    if (!newuser) {
      APIResponse(response, false, HttpStatusCode.NOT_FOUND, 'User not found..!');
      return;
    }

    APIResponse(response, true, HttpStatusCode.OK, 'New password successfully updated..!', newuser);
    return;
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
      return;
    }
    return next(error);
  }
};

const logoutHandler: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  try {
    // @ts-expect-error
    request.session = null;
    response.clearCookie('access_token', COOKIE_OPTIONS);
    response.clearCookie('refresh_token', COOKIE_OPTIONS);
    APIResponse(response, true, HttpStatusCode.OK, 'Logged out successfully..!');
    return;
  } catch (error: unknown) {
    return next(error);
  }
};

const firebaseSocialLogin: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { idToken, screenName } = request.body;

    const userInfo = await getUserDataFromToken(idToken, response, screenName);

    if (!userInfo) return;

    const { email, first_name, profile_image, provider } = userInfo;

    let user = await User.findOne({ email });
    if (user) {
      if (user.provider !== provider) {
        const current = providerNameMap[provider] || provider;
        const existing = providerNameMap[user.provider] || user.provider;

        if (user.provider === 'base-app-user') {
          return APIResponse(
            response,
            false,
            HttpStatusCode.BAD_REQUEST,
            `This email is already registered with Email/Password. Please log in with your email and password or link your ${current} account.`
          );
        }

        return APIResponse(
          response,
          false,
          HttpStatusCode.BAD_REQUEST,
          `This email is already registered with ${existing}. Please log in using ${existing}.`
        );
      }
    } else {
      // Signup flow
      user = await User.create({
        first_name: first_name,
        email: email,
        profile_image: profile_image,
        status: true,
        is_email_verified: true,
        provider: provider,
        is_password_available: Boolean(user?.password),
      });
    }

    if (!user.status) {
      return APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'The user has not verified their email..!');
    }

    const tokenData = {
      id: user._id,
      email: user.email,
    };

    const userData = {
      _id: user._id,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      email: user.email,
      profile_image: user.profile_image,
      status: user.status,
      is_password_available: user.is_password_available,
    };

    const { accessToken, refreshToken } = await generateTokens(tokenData);

    return sendWithCookie({
      res: response,
      message: 'Login successful..!',
      status: 200,
      data: { user: userData, accessToken, refreshToken },
    });
  } catch (error: any) {
    console.error('Firebase login error:', error?.message || error);
    return next(error);
  }
};

export const getUserDataFromToken = async (idToken: string, response: Response, screenName?: string): Promise<IUserInfo | undefined> => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Invalid or missing user info from Firebase token.');
      return;
    }
    const { email, picture, email_verified, firebase, uid } = decodedToken;

    const provider = firebase?.sign_in_provider;
    const userRecord = await admin.auth().getUser(uid);

    const firstName = provider === 'github.com' ? (screenName ?? userRecord.displayName ?? '') : (userRecord.displayName ?? '');
    return {
      first_name: firstName,
      email,
      profile_image: picture ?? userRecord.photoURL ?? '',
      status: true,
      is_email_verified: email_verified,
      provider: provider,
    };
  } catch (err) {
    APIResponse(response, false, HttpStatusCode.UNAUTHORIZED, 'Firebase Token verification failed');
    return;
  }
};

export default { Signup, Signin, RefreshToken, VerifyEmail, ForgotPassword, ChangePassword, ResetPassword, logoutHandler, firebaseSocialLogin };
