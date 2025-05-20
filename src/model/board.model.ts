import mongoose from 'mongoose';
import { BOARD_BACKGROUND_TYPE } from '../config/app.config';

export interface BoardModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  name?: string;
  description?: string;
  createdBy?: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
  backgroundType: string;
  background: string;
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
    backgroundType: {
      type: String,
      upperCase: true,
      default: BOARD_BACKGROUND_TYPE.COLOR,
      enum: BOARD_BACKGROUND_TYPE,
    },
    background: {
      type: String,
      default: '#FFF',
    },
  },
  { timestamps: true }
);

schema.index({ createdBy: 1, workspaceId: 1 });

export const BoardModel = mongoose.model('boards', schema);
