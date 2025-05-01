import { Joi } from 'celebrate';
import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { validateRequest } from '../utils/validation.utils';
import { contactUsSchema } from '../schemas/contactUs.schema';
import ContactUsModel from '../model/contactUs.model';

const ContactUs: RequestHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    await validateRequest(request.body, contactUsSchema);

    const newContactUsRequest = request.body;
    const contactUsRequestCreated = await ContactUsModel.create(newContactUsRequest);
    if (!contactUsRequestCreated) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Something went wrong..!');
      return;
    }

    APIResponse(response, true, HttpStatusCode.CREATED, 'Your request send successfully..!');
  } catch (error: unknown) {
    if (error instanceof Joi.ValidationError) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    } else {
      return next(error);
    }
  }
};

export default { ContactUs };
