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
import { MEMBER_INVITE_STATUS } from '../../src/config/app.config';

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

      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(User, 'findOne').resolves(null);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves(rejectedInvite as any);

      sinon.stub(ejs, 'renderFile').resolves('<html>Email content</html>');
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves(true as any);

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

      sinon.stub(BoardModel, 'findByIdAndUpdate').resolves(mockBoard as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(mockWorkspace as any);
      sinon.stub(User, 'findOne').resolves(null);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves(pendingInvite as any);

      sinon.stub(ejs, 'renderFile').resolves('<html>Email content</html>');
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves(true as any);

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
      sinon.stub(BoardModel, 'findByIdAndDelete').resolves(mockBoard as any);
      sinon.stub(MemberModel, 'deleteMany').resolves({ deletedCount: 2 } as any);
      sinon.stub(BoardInviteModel, 'deleteMany').resolves({ deletedCount: 1 } as any);

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
      sinon.stub(BoardModel, 'findByIdAndDelete').throws(new Error('Something went wrong'));

      const res = await server.delete(`${API_URL}/board/delete-board/${mockBoard._id}`).set('Cookie', ['access_token=token']);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Something went wrong');
    });
  });
});
