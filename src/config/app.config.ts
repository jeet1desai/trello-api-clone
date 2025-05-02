import express from 'express';
import mongoose from 'mongoose';

export const COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
};

export const TOKEN_EXP = {
  access_token: '15m',
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
}

export enum WorkspaceSortType {
  NameAsc = 1,
  NameDesc = 2,
  CreatedDateAsc = 3,
  CreatedDateDesc = 4,
}

export const convertObjectId = (id: string): mongoose.Types.ObjectId => {
  return new mongoose.Types.ObjectId(id);
};

export const getSortOption = (sortType: WorkspaceSortType): Record<string, 1 | -1> => {
  switch (sortType) {
    case WorkspaceSortType.NameAsc:
      return { name: 1 };
    case WorkspaceSortType.NameDesc:
      return { name: -1 };
    case WorkspaceSortType.CreatedDateAsc:
      return { createdAt: 1 };
    case WorkspaceSortType.CreatedDateDesc:
      return { createdAt: -1 };
    default:
      return { createdAt: -1 }; // fallback
  }
};
