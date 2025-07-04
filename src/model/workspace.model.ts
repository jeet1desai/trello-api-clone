import mongoose from 'mongoose';

export interface WorkspaceModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  name: string;
  description: string;
  createdBy: mongoose.Schema.Types.ObjectId;
  boards: number;
  isFavorite: boolean;
}

const schema = new mongoose.Schema<WorkspaceModelType>(
  {
    name: {
      type: String,
      default: '',
      required: [true, 'Please provide a workspace name'],
    },
    description: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: '',
      index: true,
      ref: 'users',
    },
    boards: {
      type: Number,
      default: 0,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const WorkSpaceModel = mongoose.model('workspaces', schema);
