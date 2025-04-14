import mongoose from 'mongoose';
import { Priority, TaskStatus } from '../helper/enum';

export interface TaskModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  task_id?: mongoose.Types.ObjectId;
  label_id?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<TaskModelType>(
  {
    task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'task',
      required: true,
    },
    label_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'labels',
    },
  },
  { timestamps: true }
);

export const TaskLabelModel = mongoose.model('task_labels', schema);
