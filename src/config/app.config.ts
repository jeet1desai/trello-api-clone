import express from 'express';

export const COOKIE_OPTIONS: express.CookieOptions = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
};

export const TOKEN_EXP = {
  access_token: '20s',
  refresh_token: '10m',
};
