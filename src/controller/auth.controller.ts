import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import User from '../model/user.model';
import bcryptJS from 'bcryptjs';
import { HttpStatusCode } from '../helper/enum';
import { validateRequest } from '../utils/validation.utils';
import { loginSchema, signupSchema } from '../schemas/auth.schema';
import Joi from 'joi';
import jwt from 'jsonwebtoken';

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
    APIResponse(response, true, HttpStatusCode.CREATED, 'User successfully registered..!', userCreated);
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
    const validatePassword = await bcryptJS.compare(password, user.password);

    if (!validatePassword) {
      APIResponse(response, false, 401, 'Invalid username or password');
      return;
    }

    const tokenData = {
      id: user._id,
      email: user.email,
    };

    const token = jwt.sign(tokenData, process.env.TOEKN_SECRET!, {
      expiresIn: '1d',
    });

    APIResponse(response, true, 200, 'Login successfull', { user, token });
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

export default { Signup, Signin };
