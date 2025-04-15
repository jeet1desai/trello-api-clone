import mongoose from 'mongoose';

export interface NotificationModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  message?: string;
  action?: string;
  read?: boolean;
  receiver?: mongoose.Schema.Types.ObjectId;
  sender?: mongoose.Schema.Types.ObjectId;
}

const schema = new mongoose.Schema<NotificationModelType>(
  {
    message: {
      type: String,
      required: 'Message is required!',
    },
    action: {
      type: String,
    },
    read: {
      type: Boolean,
      default: false,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  { timestamps: true }
);

schema.index({ sender: 1, receiver: 1 });

export const NotificationModel = mongoose.model('notification', schema);
