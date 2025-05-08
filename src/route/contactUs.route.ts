import express from 'express';
const contactUsRouter = express.Router();
import contactUsController from '../controller/contactus.controller';

const { ContactUs } = contactUsController;

contactUsRouter.route('/contact-us').post(ContactUs);

export default contactUsRouter;
