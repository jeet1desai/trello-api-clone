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
  },
  { timestamps: true }
);

const User = mongoose.models.users || mongoose.model('users', userSchema);
export default User;
