import express from 'express';

export const COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
};

export const TOKEN_EXP = {
  access_token: '15m',
  refresh_token: '30d',
};
