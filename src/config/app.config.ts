import express from 'express';
import mongoose from 'mongoose';

export const COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
};

export const TOKEN_EXP = {
  access_token: '1d',
  refresh_token: '30d',
  email_token: '1d',
};

export enum MEMBER_ROLES {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum MEMBER_INVITE_STATUS {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  ADMIN_PENDING = 'ADMIN_PENDING',
  ADMIN_APPROVED = 'ADMIN_APPROVED',
  ADMIN_REJECTED = 'ADMIN_REJECTED',
}

export enum BOARD_BACKGROUND_TYPE {
  IMAGE = 'IMAGE',
  COLOR = 'COLOR',
  CUSTOM = 'CUSTOM',
}

export enum SORT_TYPE {
  NameAsc = 1,
  NameDesc = 2,
  CreatedDateAsc = 3,
  CreatedDateDesc = 4,
}

export const convertObjectId = (id: string): mongoose.Types.ObjectId => {
  return new mongoose.Types.ObjectId(id);
};

export const getSortOption = (sortType: SORT_TYPE): Record<string, 1 | -1> => {
  switch (sortType) {
    case SORT_TYPE.NameAsc:
      return { name: 1 };
    case SORT_TYPE.NameDesc:
      return { name: -1 };
    case SORT_TYPE.CreatedDateAsc:
      return { createdAt: 1 };
    case SORT_TYPE.CreatedDateDesc:
      return { createdAt: -1 };
    default:
      return { createdAt: -1 }; // fallback
  }
};
