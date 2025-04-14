import mongoose from 'mongoose';

export interface LabelModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  name?: string;
  backgroundColor?: string;
  textColor?: string;
  createdBy?: mongoose.Types.ObjectId;
  boardId?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<LabelModelType>(
  {
    name: {
      type: String,
      default: '',
    },
    backgroundColor: {
      type: String,
      default: '',
    },
    textColor: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'boards',
    },
  },
  { timestamps: true }
);

schema.index({ createdBy: 1, boardId: 1 });

export const LabelModel = mongoose.model('labels', schema);
