import mongoose from 'mongoose';
import { MEMBER_INVITE_STATUS, MEMBER_ROLES } from '../config/app.config';

export interface BoardInviteModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  email?: string;
  boardId: mongoose.Schema.Types.ObjectId;
  invitedBy?: mongoose.Schema.Types.ObjectId;
  workspaceId: mongoose.Schema.Types.ObjectId;
  status?: MEMBER_INVITE_STATUS;
  role?: MEMBER_ROLES;
  is_approved_by_admin?: Boolean;
}

const schema = new mongoose.Schema<BoardInviteModelType>(
  {
    email: {
      type: String,
      default: '',
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'boards',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'workspaces',
    },
    status: {
      type: String,
      upperCase: true,
      default: MEMBER_INVITE_STATUS.PENDING,
      enum: MEMBER_INVITE_STATUS,
    },
    is_approved_by_admin: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      upperCase: true,
      default: MEMBER_ROLES.MEMBER,
      enum: MEMBER_ROLES,
    },
  },
  { timestamps: true }
);

schema.index({ workspaceId: 1, boardId: 1, invitedBy: 1 });

export const BoardInviteModel = mongoose.model('boardInvite', schema);
