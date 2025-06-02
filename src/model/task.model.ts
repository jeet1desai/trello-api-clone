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
  estimated_hours: number;
  estimated_minutes: number;
  total_estimated_time: number;
  actual_time_spent: number;
  timer_start_time: Date | null;
  is_timer_active: boolean;
  timer_sessions: {
    start_time: Date;
    end_time: Date;
    duration: number;
  }[];
  timer_status: string;
}

const taskSchema = new mongoose.Schema<TaskModelType>(
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
    estimated_hours: {
      type: Number,
      required: true,
      min: 0,
    },
    estimated_minutes: {
      type: Number,
      required: true,
      min: 0,
      max: 59,
    },
    total_estimated_time: {
      type: Number, // in milliseconds
      required: true,
      default: 0,
    },
    actual_time_spent: {
      type: Number,
      default: 0, // in milliseconds
    },
    timer_start_time: {
      type: Date,
      default: null,
    },
    is_timer_active: {
      type: Boolean,
      default: false,
    },
    timer_sessions: [
      {
        start_time: Date,
        end_time: Date,
        duration: Number, // in milliseconds
      },
    ],
    timer_status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

taskSchema.pre('save', function (next) {
  if (this.isModified('estimated_hours') || this.isModified('estimated_minutes')) {
    this.total_estimated_time = this.estimated_hours * 60 * 60 * 1000 + this.estimated_minutes * 60 * 1000;
  }
  next();
});

export const TaskModel = mongoose.model('task', taskSchema);
