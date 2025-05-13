import mongoose from 'mongoose';

export interface ContactUsModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  name: string;
  description: string;
  email: string;
}

const contactUsSchema = new mongoose.Schema<ContactUsModelType>(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
    },
    email: {
      type: String,
      required: [true, 'Please provide a email'],
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
    },
  },
  { timestamps: true }
);

const ContactUs = mongoose.models.contactUs || mongoose.model('ContactUs', contactUsSchema);
export default ContactUs;
