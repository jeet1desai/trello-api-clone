import express from 'express';

export const createWorkSpaceController = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    console.log(req);
  } catch (err) {}
};
