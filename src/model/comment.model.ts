import mongoose from 'mongoose';

export interface CommentModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  comment: string;
  attachment: {
    imageName: string;
    imageId: string;
    url: string;
  }[];
  task_id?: mongoose.Types.ObjectId;
  commented_by?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<CommentModelType>(
  {
    comment: {
      type: String,
      default: '',
      required: true,
    },
    attachment: [
      {
        imageName: { type: String, required: true },
        imageId: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'task',
      required: true,
    },
    commented_by: {
      type: mongoose.Schema.Types.ObjectId,
      default: '',
      ref: 'users',
    },
  },
  { timestamps: true }
);

export const CommentModel = mongoose.model('comments', schema);
