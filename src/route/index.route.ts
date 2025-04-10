import { Application } from 'express';
import workspaceRouter from './workspace.route';
import boardRouter from './board.route';
import authRouter from './auth.route';
import invitationRouter from './invitation.route';

const BASE_PATH = '/v1/api';

export default (app: Application) => {
  const routes = () => {
    app.use(`${BASE_PATH}/auth`, authRouter);
    app.use(`${BASE_PATH}/workspace`, workspaceRouter);
    app.use(`${BASE_PATH}/board`, boardRouter);
    app.use(`${BASE_PATH}/invite`, invitationRouter);
  };
  routes();
};
