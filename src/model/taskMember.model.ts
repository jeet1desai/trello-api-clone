import mongoose from 'mongoose';

export interface TaskModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  task_id?: mongoose.Types.ObjectId;
  member_id?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<TaskModelType>(
  {
    task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'task',
      required: true,
    },
    member_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  { timestamps: true }
);

export const TaskMemberModel = mongoose.model('task_members', schema);
