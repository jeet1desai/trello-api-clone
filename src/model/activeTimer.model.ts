import mongoose from 'mongoose';

export interface ActiveTimerModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId;
  task_id?: mongoose.Types.ObjectId;
  start_time: Date;
}

const activeTimerSchema = new mongoose.Schema<ActiveTimerModelType>(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      unique: true,
    },
    task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'task',
      required: true,
    },
    start_time: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ActiveTimerModel = mongoose.model<ActiveTimerModelType>('active_timer', activeTimerSchema);
