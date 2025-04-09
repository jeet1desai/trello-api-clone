import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: [true, 'Please provide a firstname'],
    },
    middle_name: {
      type: String,
      required: [true, 'Please provide a middlename'],
    },
    last_name: {
      type: String,
      required: [true, 'Please provide a lastname'],
    },
    email: {
      type: String,
      required: [true, 'Please provide a email'],
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      unique: true,
    },
    profile_image: {
      type: String,
    },
    email_token: {
      type: String,
    },
    email_token_expires_at: {
      type: Date,
    },
    is_email_verified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otp_expire: {
      type: Date,
    },
    status: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const User = mongoose.models.users || mongoose.model('users', userSchema);
export default User;
