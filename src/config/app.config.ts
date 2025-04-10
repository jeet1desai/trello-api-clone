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

export const convertObjectId = (id: string): mongoose.Types.ObjectId => {
  return new mongoose.Types.ObjectId(id);
};
