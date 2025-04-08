import { Request, Response, RequestHandler } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';

const GetTestData: RequestHandler = async (
  request: Request,
  response: Response
): Promise<void> => {
  try {
    const test: string = 'test data';
    APIResponse(response, true, 200, 'Test data fetched successfully', test);
  } catch (error: unknown) {
    console.log('Error - GetTestData', error);
    APIResponse(
      response,
      false,
      HttpStatusCode.BAD_GATEWAY,
      'SOmething went wrong'
    );
  }
};

export default { GetTestData };
