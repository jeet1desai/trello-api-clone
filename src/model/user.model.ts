import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: [true, 'Please provide a firstname'],
    },
    middle_name: {
      type: String,
    },
    last_name: {
      type: String,
    },
    email: {
      type: String,
      required: [true, 'Please provide a email'],
      unique: true,
    },
    password: {
      type: String,
    },
    profile_image: {
      imageName: { type: String, required: false },
      imageId: { type: String, required: false },
      url: { type: String, required: false },
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
    provider: {
      type: String,
      default: 'base-app-user',
    },
  },
  { timestamps: true }
);

const User = mongoose.models.users || mongoose.model('users', userSchema);
export default User;
