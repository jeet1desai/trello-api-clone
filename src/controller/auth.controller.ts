import { Request, Response, RequestHandler } from 'express';
import APIResponse from '../helper/apiResponse';
import User from '../model/user.model';
import bcryptJS from 'bcryptjs';
import { HttpStatusCode } from '../helper/enum';

const Signup: RequestHandler = async (
  request: Request,
  response: Response
): Promise<void> => {
  try {
    const reqBody = await request.body;
    const { password, email } = reqBody;
    const user = await User.findOne({ email });

    if (user) {
      APIResponse(
        response,
        false,
        HttpStatusCode.BAD_GATEWAY,
        'User already exists..!'
      );
    }
    const salt = await bcryptJS.genSalt(10);
    const hashedPassword = await bcryptJS.hash(password, salt);
    const newUser = {
      ...reqBody,
      password: hashedPassword,
    };
    const userCreated = await User.create(newUser);
    APIResponse(
      response,
      true,
      HttpStatusCode.CREATED,
      'User successfully registered..!',
      userCreated
    );
  } catch (error: unknown) {
    let errorMessage = 'Something went wrong';

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    APIResponse(
      response,
      false,
      HttpStatusCode.BAD_GATEWAY,
      errorMessage,
      null
    );
  }
};

export default { Signup };
