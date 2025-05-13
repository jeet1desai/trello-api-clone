import mongoose from 'mongoose';
import { Priority, TaskStatus } from '../helper/enum';

export interface TaskModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  title?: string;
  description?: string;
  attachment: {
    imageName: string;
    imageId: string;
    url: string;
  }[];
  board_id?: mongoose.Types.ObjectId;
  status_list_id?: mongoose.Types.ObjectId;
  created_by?: mongoose.Types.ObjectId;
  start_date?: Date;
  end_date?: Date;
  priority?: Priority;
  position: number;
  status?: TaskStatus;
  assigned_to?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<TaskModelType>(
  {
    title: {
      type: String,
      default: '',
      required: [true, 'Please provide a title'],
    },
    description: {
      type: String,
      default: '',
    },
    attachment: [
      {
        imageName: { type: String, required: true },
        imageId: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    board_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'boards',
      required: true,
    },
    status_list_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'status',
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      default: null,
    },
    start_date: {
      type: Date,
      default: null,
    },
    end_date: {
      type: Date,
      default: null,
    },
    priority: {
      type: String,
      enum: Object.values(Priority),
      default: 'Medium',
    },
    position: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.INCOMPLETE,
    },
  },
  { timestamps: true }
);

export const TaskModel = mongoose.model('task', schema);
