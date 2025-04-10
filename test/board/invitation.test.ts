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
import * as mailer from '../../src/utils/sendEmail';
import { MEMBER_INVITE_STATUS, MEMBER_ROLES } from '../../src/config/app.config';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

describe('Invitation API', () => {
  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /invite-details/:id', async () => {
    const inviteId = new mongoose.Types.ObjectId().toString();

    it('should return 404 if invitation is not found', async () => {
      const populateStub = {
        populate: sinon.stub().returnsThis(),
      };

      populateStub.populate.withArgs('workspaceId', 'name').resolves(null);

      const intermediateStub = {
        populate: sinon.stub().returns(populateStub),
      };

      const topStub = {
        populate: sinon.stub().returns(intermediateStub),
      };

      sinon.stub(BoardInviteModel, 'findById').returns(topStub as any);

      const res = await server.get(`${API_URL}/invite/invite-details/${inviteId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Invitation not found');
    });

    it('should return 502 if there is a DB error', async () => {
      const inviteId = new mongoose.Types.ObjectId().toString();

      sinon.stub(BoardInviteModel, 'findById').throws(new Error('Database failure'));

      const res = await server.get(`${API_URL}/invite/invite-details/${inviteId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Database failure');
    });

    it('should return 200 and invitation details if invite exists', async () => {
      const inviteId = new mongoose.Types.ObjectId().toString();

      const mockInvite = {
        _id: inviteId,
        email: 'test@invite.com',
        boardId: { _id: new mongoose.Types.ObjectId(), name: 'Test Board' },
        invitedBy: { first_name: 'John', last_name: 'Smith', email: 'john@example.com' },
        workspaceId: { _id: new mongoose.Types.ObjectId(), name: 'Test Workspace' },
        status: MEMBER_INVITE_STATUS.PENDING,
      };

      const populateStub3 = sinon.stub().resolves(mockInvite);
      const populateStub2 = sinon.stub().returns({ populate: populateStub3 });
      const populateStub1 = sinon.stub().returns({ populate: populateStub2 });

      sinon.stub(BoardInviteModel, 'findById').returns({ populate: populateStub1 } as any);

      const res = await server.get(`${API_URL}/invite/invite-details/${inviteId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data.email).to.equal('test@invite.com');
      expect(res.body.data.boardId.name).to.equal('Test Board');
      expect(res.body.data.invitedBy.email).to.equal('john@example.com');
      expect(res.body.data.workspaceId.name).to.equal('Test Workspace');
    });
  });

  describe('PUT /update-invitation/:id', async () => {
    const inviteId = new mongoose.Types.ObjectId().toString();

    it('should return 400 for invalid request body', async () => {
      const res = await server.put(`${API_URL}/invite/update-invitation/${inviteId}`).set('Cookie', [`access_token=token`]).send({});

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
    });

    it('should return 404 if invitation is not found', async () => {
      sinon.stub(BoardInviteModel, 'findOne').resolves(null as any);

      const res = await server
        .put(`${API_URL}/invite/update-invitation/${inviteId}`)
        .set('Cookie', [`access_token=token`])
        .send({ status: MEMBER_INVITE_STATUS.COMPLETED });

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('Invitation not found');
    });

    it('should return 502 on DB error', async () => {
      sinon.stub(BoardInviteModel, 'findOne').throws(new Error('DB error'));

      const res = await server
        .put(`${API_URL}/invite/update-invitation/${inviteId}`)
        .set('Cookie', [`access_token=token`])
        .send({ status: MEMBER_INVITE_STATUS.COMPLETED });

      expect(res.status).to.equal(502);
      expect(res.body.message).to.equal('DB error');
    });

    it('should return 404 if user not found for invitation email', async () => {
      sinon.stub(BoardInviteModel, 'findOne').resolves({
        _id: inviteId,
        email: 'nonexistent@example.com',
        boardId: new mongoose.Types.ObjectId(),
        workspaceId: new mongoose.Types.ObjectId(),
        status: MEMBER_INVITE_STATUS.PENDING,
      } as any);

      sinon.stub(User, 'findOne').resolves(null as any);

      const res = await server
        .put(`${API_URL}/invite/update-invitation/${inviteId}`)
        .set('Cookie', [`access_token=token`])
        .send({ status: MEMBER_INVITE_STATUS.COMPLETED });

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('User not found for the given invitation');
    });

    it('should create member if not existing and update invitation status', async () => {
      sinon.stub(BoardInviteModel, 'findOne').resolves({
        _id: inviteId,
        email: mockUser.email,
        boardId: new mongoose.Types.ObjectId(),
        workspaceId: new mongoose.Types.ObjectId(),
        status: MEMBER_INVITE_STATUS.PENDING,
        role: MEMBER_ROLES.MEMBER,
        save: sinon.stub().resolvesThis(),
      } as any);

      sinon.stub(User, 'findOne').resolves(mockUser as any);
      sinon.stub(MemberModel, 'findOne').resolves(null as any);
      const createStub = sinon.stub(MemberModel, 'create').resolves({} as any);

      const res = await server
        .put(`${API_URL}/invite/update-invitation/${inviteId}`)
        .set('Cookie', [`access_token=token`])
        .send({ status: MEMBER_INVITE_STATUS.COMPLETED });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(createStub.calledOnce).to.be.true;
    });

    it('should not create member if already exists and update invitation status', async () => {
      sinon.stub(BoardInviteModel, 'findOne').resolves({
        _id: inviteId,
        email: mockUser.email,
        boardId: new mongoose.Types.ObjectId(),
        workspaceId: new mongoose.Types.ObjectId(),
        status: MEMBER_INVITE_STATUS.PENDING,
        role: MEMBER_ROLES.MEMBER,
        save: sinon.stub().resolvesThis(),
      } as any);

      sinon.stub(User, 'findOne').resolves(mockUser as any);
      sinon.stub(MemberModel, 'findOne').resolves({} as any);
      const createStub = sinon.stub(MemberModel, 'create');

      const res = await server
        .put(`${API_URL}/invite/update-invitation/${inviteId}`)
        .set('Cookie', [`access_token=token`])
        .send({ status: MEMBER_INVITE_STATUS.COMPLETED });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(createStub.notCalled).to.be.true;
    });
  });

  describe('POST /send-invitation/:id', () => {
    const boardId = new mongoose.Types.ObjectId().toString();

    it('should return 400 for invalid request body', async () => {
      const res = await server.post(`${API_URL}/invite/send-invitation/${boardId}`).set('Cookie', [`access_token=token`]).send({});
      expect(res.status).to.equal(400);
    });

    it('should return 404 if board is not found', async () => {
      sinon.stub(BoardModel, 'findById').resolves(null as any);

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: ['test@example.com'] });

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('Board not found');
    });

    it('should return 404 if workspace is not found', async () => {
      sinon.stub(BoardModel, 'findById').resolves({ _id: boardId, workspaceId: new mongoose.Types.ObjectId() } as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves(null as any);

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: ['test@example.com'] });

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('Workspace not found');
    });

    it('should skip if email is same as user', async () => {
      sinon.stub(BoardModel, 'findById').resolves({ _id: boardId, workspaceId: new mongoose.Types.ObjectId() } as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves({ _id: new mongoose.Types.ObjectId() } as any);

      const emailStub = sinon.stub(mailer, 'sendEmail').resolves();

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: ['creator@example.com'] });

      expect(res.status).to.equal(200);
      expect(emailStub.called).to.be.false;
    });

    it('should skip if user is already a member', async () => {
      sinon.stub(BoardModel, 'findById').resolves({ _id: boardId, workspaceId: new mongoose.Types.ObjectId() } as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves({ _id: new mongoose.Types.ObjectId() } as any);
      sinon.stub(User, 'findOne').resolves({ _id: new mongoose.Types.ObjectId(), email: 'existing@example.com' } as any);
      sinon.stub(MemberModel, 'exists').resolves(true as any);

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: ['existing@example.com'] });

      expect(res.status).to.equal(200);
    });

    it('should update REJECTED invite to PENDING and send email', async () => {
      const email = 'rejected@example.com';

      sinon.stub(BoardModel, 'findById').resolves({ _id: boardId, workspaceId: new mongoose.Types.ObjectId() } as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves({ _id: new mongoose.Types.ObjectId() } as any);
      sinon.stub(User, 'findOne').resolves({ _id: new mongoose.Types.ObjectId(), email } as any);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves({
        _id: new mongoose.Types.ObjectId(),
        status: 'REJECTED',
        save: sinon.stub().resolvesThis(),
      } as any);
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves();

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: [email] });

      expect(res.status).to.equal(200);
      expect(emailStub.calledOnce).to.be.true;
    });

    it('should send email if PENDING invite exists', async () => {
      const email = 'pending@example.com';

      sinon.stub(BoardModel, 'findById').resolves({ _id: boardId, workspaceId: new mongoose.Types.ObjectId() } as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves({ _id: new mongoose.Types.ObjectId() } as any);
      sinon.stub(User, 'findOne').resolves({ _id: new mongoose.Types.ObjectId(), email } as any);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves({ _id: new mongoose.Types.ObjectId(), status: 'PENDING' } as any);
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves();

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: [email] });

      expect(res.status).to.equal(200);
      expect(emailStub.calledOnce).to.be.true;
    });

    it('should create a new invite and send email if no invite exists', async () => {
      const email = 'new@example.com';

      sinon.stub(BoardModel, 'findById').resolves({ _id: boardId, workspaceId: new mongoose.Types.ObjectId() } as any);
      sinon.stub(WorkSpaceModel, 'findById').resolves({ _id: new mongoose.Types.ObjectId() } as any);
      sinon.stub(User, 'findOne').resolves({ _id: new mongoose.Types.ObjectId(), email } as any);
      sinon.stub(MemberModel, 'exists').resolves(false as any);
      sinon.stub(BoardInviteModel, 'findOne').resolves(null as any);
      sinon.stub(BoardInviteModel, 'create').resolves({ _id: new mongoose.Types.ObjectId() } as any);
      const emailStub = sinon.stub(mailer, 'sendEmail').resolves();

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: [email] });

      expect(res.status).to.equal(200);
      expect(emailStub.calledOnce).to.be.true;
    });

    it('should return 502 on internal error', async () => {
      sinon.stub(BoardModel, 'findById').throws(new Error('DB failure'));

      const res = await server
        .post(`${API_URL}/invite/send-invitation/${boardId}`)
        .set('Cookie', [`access_token=token`])
        .send({ members: ['test@example.com'] });

      expect(res.status).to.equal(502);
      expect(res.body.message).to.equal('DB failure');
    });
  });
});
