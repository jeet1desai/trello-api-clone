import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import { WorkSpaceModel } from '../../src/model/workspace.model';
import mongoose from 'mongoose';
import { BoardModel } from '../../src/model/board.model';
import { MemberModel } from '../../src/model/members.model';
import { BoardInviteModel } from '../../src/model/boardInvite.model';
import ejs from 'ejs';
import * as mailer from '../../src/utils/sendEmail';
import { MEMBER_INVITE_STATUS, MEMBER_ROLES } from '../../src/config/app.config';
import * as socketModule from '../../src/config/socketio.config';
import { NotificationModel } from '../../src/model/notification.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

const mockWorkspace = {
  name: 'PBA 1',
  description: 'This is pass',
  createdBy: '67f50d472ae5348091c31e01',
  _id: new mongoose.Types.ObjectId().toString(),
  createdAt: '2025-04-09T08:41:09.719Z',
  updatedAt: '2025-04-09T08:41:09.719Z',
  __v: 0,
};

const mockBoard = {
  name: 'Sprint 1',
  description: 'Dashboard and bugs',
  createdBy: '67f50d472ae5348091c31e01',
  workspaceId: '67f632a547cdbb5b53b28718',
  _id: new mongoose.Types.ObjectId().toString(),
  createdAt: '2025-04-09T09:11:34.511Z',
  updatedAt: '2025-04-09T09:11:34.511Z',
  __v: 0,
};

describe('Board API', () => {
  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /create-board', async () => {
    it('should create a board and invite a new user by email', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(BoardModel, 'create').resolves([mockBoard] as any);
      sinon.stub(MemberModel, 'create').resolves({} as any);

      sinon.stub(User, 'findOne').resolves(mockUser as any);

      server
        .post(`${API_URL}/board/create-board`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
          workspace: '67f632a547cdbb5b53b28718',
        })
        .expect(201)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Board successfully created');
          done();
        });
    });

    it('should handle workspace not found', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').resolves(null as any);

      server
        .post(`${API_URL}/board/create-board`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
          workspace: '67f632a547cdbb5b53b28718',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });

    it('should validate input and return validation error', (done) => {
      server
        .post(`${API_URL}/board/create-board`)
        .set('Cookie', ['access_token=token'])
        .send({
          description: 'Missing name',
          workspace: '67f632a547cdbb5b53b28718',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Board name is required');
          done();
        });
    });

    it('should return 502 on unexpected DB error', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(BoardModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/board/create-board`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
          workspace: '67f632a547cdbb5b53b28718',
        })
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });

    it('should create board with existing members and invite new users', async () => {
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      const board = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Board A',
        description: 'Testing',
      };

      sinon.stub(BoardModel, 'create').resolves([board] as any);
      sinon.stub(MemberModel, 'create').resolves({} as any);

      sinon
        .stub(User, 'findOne')
        .onFirstCall()
        .resolves(mockUser as any)
        .onSecondCall()
        .resolves(null);

      sinon.stub(BoardInviteModel, 'create').resolves([{ _id: new mongoose.Types.ObjectId() }] as any);
      sinon.stub(ejs, 'renderFile').resolves('<html>email</html>');
      sinon.stub(mailer, 'sendEmail').resolves({ success: true, info: {} } as any);

      const response = await server
        .post(`${API_URL}/board/create-board`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Board A',
          description: 'Testing',
          workspace: mockWorkspace._id.toString(),
          members: ['creator@example.com', 'newuser@example.com'],
        });

      expect(response.status).to.equal(201);
      expect(response.body.success).to.be.true;
      expect(response.body.message).to.equal('Board successfully created');
    });

    it('should create board with existing members and invite new users and emit socket notification', async () => {
      const boardId = new mongoose.Types.ObjectId();
      const board = {
        _id: boardId,
        name: 'Test Board',
        description: 'Board for testing',
        workspaceId: mockWorkspace._id,
      };

      const invitedUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'invited@example.com',
      };

      const notification = {
        _id: new mongoose.Types.ObjectId(),
        message: `You have been invited to board "${board.name}"`,
        receiver: invitedUser._id,
        sender: mockUser._id,
      };

      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(BoardModel, 'create').resolves([board] as any);
      sinon.stub(MemberModel, 'create').resolves({} as any);
      sinon.stub(BoardInviteModel, 'create').resolves([{ _id: new mongoose.Types.ObjectId() }] as any);
      sinon.stub(User, 'findOne').resolves(invitedUser as any);
      sinon.stub(NotificationModel, 'create').resolves(notification as any);
      sinon.stub(mailer, 'sendEmail').resolves();

      const emitStub = sinon.stub();
      const toStub = sinon.stub().returns({ emit: emitStub });

      sinon.stub(socketModule, 'getSocket').returns({ io: { to: toStub } } as any);

      const usersMap = new Map();
      usersMap.set(invitedUser._id.toString(), 'socket123');
      sinon.stub(socketModule, 'users').value(usersMap);

      const response = await server
        .post(`${API_URL}/board/create-board`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Board A',
          description: 'Testing',
          workspace: mockWorkspace._id.toString(),
          members: ['creator@example.com', 'newuser@example.com'],
        });

      expect(response.status).to.equal(201);
      expect(response.body.success).to.be.true;
      expect(emitStub.calledOnce).to.be.true;

      const [eventName, payload] = emitStub.firstCall.args;
      expect(eventName).to.equal('receive_notification');
      expect(payload.data.message).to.include('invited to board');
    });
  });

  describe('PUT /update-board/:id', async () => {
    it('should update a board and invite a new user by email', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(MemberModel, 'create').resolves({} as any);
      sinon.stub(User, 'findOne').resolves(mockUser as any);

      server
        .put(`${API_URL}/board/update-board/67f632a547cdbb5b53b28718`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Board successfully updated');
          done();
        });
    });

    it('should handle workspace not found', (done) => {
      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(null as any);

      server
        .put(`${API_URL}/board/update-board/67f632a547cdbb5b53b28718`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });

    it('should handle board not found', (done) => {
      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(null as any);

      server
        .put(`${API_URL}/board/update-board/67f632a547cdbb5b53b28718`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Board not found');
          done();
        });
    });

    it('should return 502 on unexpected DB error', (done) => {
      sinon.stub(BoardModel, 'findByIdAndUpdate').rejects(new Error('DB error'));

      server
        .put(`${API_URL}/board/update-board/67f632a547cdbb5b53b28718`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
        })
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });

    it('should update board and add members (existing + invited)', async () => {
      const existingUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'existing@user.com',
        first_name: 'John',
        last_name: 'Smith',
      };

      // Stub Board update and Workspace lookup
      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);

      // Stub User.findOne calls
      sinon
        .stub(User, 'findOne')
        .onFirstCall()
        .resolves(existingUser as any) // existing@user.com
        .onSecondCall()
        .resolves(null); // new@user.com

      // Stub MemberModel.exists to simulate no current membership
      sinon.stub(MemberModel, 'exists').resolves(false as any);

      // Stub BoardInviteModel.findOne to simulate no previous invite
      sinon.stub(BoardInviteModel, 'findOne').resolves(null as any);

      // Stub BoardInviteModel.create
      sinon.stub(BoardInviteModel, 'create').resolves({ _id: new mongoose.Types.ObjectId() } as any);

      // Stub EJS email render
      sinon.stub(ejs, 'renderFile').resolves('<html>Email content</html>');

      // Stub sendEmail
      sinon.stub(mailer, 'sendEmail').resolves(true as any);

      const res = await server
        .put(`${API_URL}/board/update-board/${mockBoard._id}`)
        .set('Cookie', [`access_token=token`])
        .send({
          name: 'Updated Sprint',
          description: 'Updated description',
          members: ['existing@user.com', 'new@user.com'],
        });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Board successfully updated');
      expect(res.body.data.name).to.equal('Sprint 1');
    });

    it('should skip sending email if invite status is COMPLETED', async () => {
      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);

      const completedInvite = {
        status: MEMBER_INVITE_STATUS.COMPLETED,
        _id: new mongoose.Types.ObjectId(),
      };

      sinon.stub(User, 'findOne').resolves(null);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves(completedInvite as any);
      const emailStub = sinon.stub(mailer, 'sendEmail');

      const res = await server
        .put(`${API_URL}/board/update-board/${mockBoard._id}`)
        .set('Cookie', [`access_token=token`])
        .send({
          name: 'Board X',
          description: 'Board X Desc',
          members: ['completed@user.com'],
        });

      expect(res.status).to.equal(200);
      expect(emailStub.called).to.be.false;
    });

    it('should update REJECTED invite to PENDING and send email', async () => {
      const rejectedInvite = {
        status: MEMBER_INVITE_STATUS.REJECTED,
        _id: new mongoose.Types.ObjectId(),
        save: sinon.stub().resolves(),
      };

      const invitedUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'invited@example.com',
      };

      const notification = {
        _id: new mongoose.Types.ObjectId(),
        message: `You have been invited to board "${mockBoard.name}"`,
        receiver: invitedUser._id,
        sender: mockUser._id,
      };

      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(User, 'findOne').resolves(invitedUser as any);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves(rejectedInvite as any);
      sinon.stub(NotificationModel, 'create').resolves(notification as any);
      sinon.stub(ejs, 'renderFile').resolves('<html>Email content</html>');
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves(true as any);

      const emitStub = sinon.stub();
      const toStub = sinon.stub().returns({ emit: emitStub });
      sinon.stub(socketModule, 'getSocket').returns({ io: { to: toStub } } as any);
      const usersMap = new Map();
      usersMap.set(invitedUser._id.toString(), 'socket123');
      sinon.stub(socketModule, 'users').value(usersMap);

      const res = await server
        .put(`${API_URL}/board/update-board/${mockBoard._id}`)
        .set('Cookie', [`access_token=token`])
        .send({
          name: 'Board X',
          description: 'Board X Desc',
          members: ['rejected@user.com'],
        });

      expect(res.status).to.equal(200);
      expect(rejectedInvite.save.calledOnce).to.be.true;
      expect(emailStub.calledOnce).to.be.true;
    });

    it('should send email if invite status is PENDING', async () => {
      const pendingInvite = {
        status: MEMBER_INVITE_STATUS.PENDING,
        _id: new mongoose.Types.ObjectId(),
      };

      const invitedUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'invited@example.com',
      };

      const notification = {
        _id: new mongoose.Types.ObjectId(),
        message: `You have been invited to board "${mockBoard.name}"`,
        receiver: invitedUser._id,
        sender: mockUser._id,
      };

      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(User, 'findOne').resolves(invitedUser as any);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves(pendingInvite as any);
      sinon.stub(NotificationModel, 'create').resolves(notification as any);
      sinon.stub(ejs, 'renderFile').resolves('<html>Email content</html>');
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves(true as any);

      const emitStub = sinon.stub();
      const toStub = sinon.stub().returns({ emit: emitStub });
      sinon.stub(socketModule, 'getSocket').returns({ io: { to: toStub } } as any);
      const usersMap = new Map();
      usersMap.set(invitedUser._id.toString(), 'socket123');
      sinon.stub(socketModule, 'users').value(usersMap);

      const res = await server
        .put(`${API_URL}/board/update-board/${mockBoard._id}`)
        .set('Cookie', [`access_token=token`])
        .send({
          name: 'Board X',
          description: 'Board X Desc',
          members: ['pending@user.com'],
        });

      expect(res.status).to.equal(200);
      expect(emailStub.calledOnce).to.be.true;
    });
  });

  describe('DELETE /delete-board/:id', async () => {
    it('should delete a board and its members and invites', async () => {
      const populatedMember = { memberId: mockUser._id, _id: mockUser._id };

      const receiver = { _id: new mongoose.Types.ObjectId(), email: 'invited@example.com' };

      const notification = {
        _id: new mongoose.Types.ObjectId(),
        message: `Board "${mockBoard.name}" is deleted by admin and you have been removed from board`,
        receiver: populatedMember.memberId,
        sender: mockUser._id,
      };

      sinon.stub(BoardModel, 'findById').resolves(mockBoard as any);
      sinon.stub(MemberModel, 'findOne').resolves({ role: MEMBER_ROLES.ADMIN } as any);
      sinon.stub(MemberModel, 'find').returns({
        populate: sinon.stub().resolves([populatedMember] as any),
      } as any);
      sinon.stub(BoardModel, 'deleteOne').resolves({} as any);
      sinon.stub(MemberModel, 'deleteMany').resolves({} as any);
      sinon.stub(BoardInviteModel, 'deleteMany').resolves({} as any);

      sinon.stub(NotificationModel, 'create').resolves([notification] as any);

      const emitStub = sinon.stub();
      const toStub = sinon.stub().returns({ emit: emitStub });
      sinon.stub(socketModule, 'getSocket').returns({ io: { to: toStub } } as any);
      const usersMap = new Map();
      usersMap.set(receiver._id.toString(), 'socket123');
      sinon.stub(socketModule, 'users').value(usersMap);

      const res = await server.delete(`${API_URL}/board/delete-board/${mockBoard._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Board successfully deleted');
    });

    it('should return 404 if board not found', async () => {
      sinon.stub(BoardModel, 'findByIdAndDelete').resolves(null);

      const res = await server.delete(`${API_URL}/board/delete-board/${mockBoard._id}`).set('Cookie', ['access_token=token']);

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Board not found');
    });

    it('should handle internal server errors gracefully', async () => {
      sinon.stub(BoardModel, 'findById').throws(new Error('Something went wrong'));

      const res = await server.delete(`${API_URL}/board/delete-board/${mockBoard._id}`).set('Cookie', ['access_token=token']);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Something went wrong');
    });

    it('should return validation error if user is not admin', async () => {
      sinon.stub(BoardModel, 'findById').resolves(mockBoard as any);
      sinon.stub(MemberModel, 'findOne').resolves({ role: MEMBER_ROLES.MEMBER } as any);

      const res = await server.delete(`${API_URL}/board/delete-board/${mockBoard._id}`).set('Cookie', ['access_token=token']);

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('You do not have permission to delete board');
    });
  });

  describe('GET /get-boards-list/:id', async () => {
    it('should return boards list', async () => {
      const res = await server.get(`${API_URL}/board/get-boards-list/${mockWorkspace._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Boards successfully fetched');
      expect(res.body.data).to.be.an('array');
    });

    it('should return empty array when workspace has no boards', async () => {
      sinon.stub(BoardModel, 'aggregate').resolves([]);

      const res = await server.get(`${API_URL}/board/get-boards-list/${mockWorkspace._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data).to.be.an('array').that.is.empty;
    });

    it('should handle internal server error gracefully', async () => {
      sinon.stub(BoardModel, 'aggregate').throws(new Error('Something went wrong'));

      const res = await server.get(`${API_URL}/board/get-boards-list/${mockWorkspace._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Something went wrong');
    });
  });

  describe('GET /get-board/:id', async () => {
    it('should return board details when board exists', async () => {
      sinon.stub(BoardModel, 'aggregate').resolves([mockBoard]);
      const res = await server.get(`${API_URL}/board/get-board/${mockBoard._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Board successfully fetched');
      expect(res.body.data).to.deep.equal(mockBoard);
    });

    it('should return 404 when board is not found', async () => {
      sinon.stub(BoardModel, 'aggregate').resolves([]);

      const res = await server.get(`${API_URL}/board/get-board/660000000000000000000000`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Board not found');
    });

    it('should handle internal server error gracefully', async () => {
      sinon.stub(BoardModel, 'aggregate').throws(new Error('Internal DB error'));

      const res = await server.get(`${API_URL}/board/get-board/${mockBoard._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Internal DB error');
    });

    it('should return 401 if token is missing', async () => {
      const res = await server.get(`${API_URL}/board/get-board/${mockBoard._id}`);

      expect(res.status).to.equal(401);
      expect(res.body.success).to.be.false;
    });
  });
});
