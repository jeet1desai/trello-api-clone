import mongoose from 'mongoose';

export interface BoardModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  name?: string;
  description?: string;
  createdBy?: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<BoardModelType>(
  {
    name: {
      type: String,
      default: '',
      required: [true, 'Please provide a board name'],
    },
    description: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: '',
      ref: 'users',
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: '',
      ref: 'workspaces',
    },
  },
  { timestamps: true }
);

schema.index({ createdBy: 1, workspaceId: 1 });

export const BoardModel = mongoose.model('boards', schema);
