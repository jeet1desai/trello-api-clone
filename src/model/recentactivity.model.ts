import mongoose from 'mongoose';
import { Priority, TaskStatus } from '../helper/enum';

export interface RecentActivityModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  created_by?: mongoose.Types.ObjectId;
  board?: mongoose.Types.ObjectId;
  details: string;
  action?: string;
  module?: string;
  visible_to?: string[];
  task?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<RecentActivityModelType>(
  {
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
    action: { type: String, required: true },
    module: { type: String, required: true },
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'boards', required: false },
    details: { type: String },
    visible_to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'task', required: false },
  },
  { timestamps: true }
);

export const RecentActivityModel = mongoose.model('recentactivities', schema);
