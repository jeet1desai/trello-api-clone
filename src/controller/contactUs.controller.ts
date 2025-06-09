import path from 'path';
import { Joi } from 'celebrate';
import { Request, Response, RequestHandler, NextFunction } from 'express';
import APIResponse from '../helper/apiResponse';
import { HttpStatusCode } from '../helper/enum';
import { validateRequest } from '../utils/validation.utils';
import { contactUsSchema } from '../schemas/contactUs.schema';
import ContactUsModel from '../model/contactUs.model';
import { sendEmail } from '../utils/sendEmail';
import ejs from 'ejs';
import path from 'path';

const ContactUs: RequestHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    await validateRequest(request.body, contactUsSchema);

    const newContactUsRequest = request.body;
    const contactUsRequestCreated = await ContactUsModel.create(newContactUsRequest);
    if (!contactUsRequestCreated) {
      APIResponse(response, false, HttpStatusCode.BAD_REQUEST, 'Something went wrong..!');
      return;
    }

    const templatePath = path.join(process.cwd(), 'email-templates', 'contact-us.ejs');
    const html = await ejs.renderFile(templatePath, {
      name: newContactUsRequest.name,
      description: newContactUsRequest.description,
    });

    const mailOptions: any = {
      to: process.env.EMAIL,
      subject: 'Want to collaborate',
      html,
    };

    await sendEmail(mailOptions);

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
