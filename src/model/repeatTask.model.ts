import mongoose from 'mongoose';

const RepeatTaskSchema = new mongoose.Schema(
  {
    task_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'task' },
    repeat_type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    next_repeat_on: {
      type: Date,
      required: true,
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'user' },
  },
  { timestamps: true }
);

export const RepeatTaskModel = mongoose.model('RepeatTask', RepeatTaskSchema);
