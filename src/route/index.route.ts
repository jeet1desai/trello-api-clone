import { Application } from 'express';
import workspaceRouter from './workspace.route';
import boardRouter from './board.route';
import authRouter from './auth.route';
import invitationRouter from './invitation.route';
import userRouter from './user.route';
import statusRouter from './status.route';
import memberRouter from './member.route';
import taskRouter from './task.route';
import taskMemberRouter from './task_member.route';
import labelRouter from './label.route';
import taskLabelRouter from './task_label.route';
import notificationRouter from './notification.route';
import commentRouter from './comment.route';
import dashboardRouter from './dashboard.route';

const BASE_PATH = '/v1/api';

export default (app: Application) => {
  const routes = () => {
    app.use(`${BASE_PATH}/auth`, authRouter);
    app.use(`${BASE_PATH}/workspace`, workspaceRouter);
    app.use(`${BASE_PATH}/board`, boardRouter);
    app.use(`${BASE_PATH}/invite`, invitationRouter);
    app.use(`${BASE_PATH}/user`, userRouter);
    app.use(`${BASE_PATH}/status`, statusRouter);
    app.use(`${BASE_PATH}/member`, memberRouter);
    app.use(`${BASE_PATH}/task`, taskRouter);
    app.use(`${BASE_PATH}/task-member`, taskMemberRouter);
    app.use(`${BASE_PATH}/label`, labelRouter);
    app.use(`${BASE_PATH}/tasklabel`, taskLabelRouter);
    app.use(`${BASE_PATH}/notification`, notificationRouter);
    app.use(`${BASE_PATH}/comment`, commentRouter);
    app.use(`${BASE_PATH}/dashboard`, dashboardRouter);
  };
  routes();
};
