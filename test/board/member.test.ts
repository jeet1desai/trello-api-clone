import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { BoardModel } from '../../src/model/board.model';
import { MemberModel } from '../../src/model/members.model';
import { BoardInviteModel } from '../../src/model/boardInvite.model';
import { MEMBER_ROLES } from '../../src/config/app.config';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

describe('Members API', () => {
  let boardId: string;
  let targetUserId: string;

  beforeEach(() => {
    boardId = new mongoose.Types.ObjectId().toString();
    targetUserId = new mongoose.Types.ObjectId().toString();

    sinon.stub(jwt, 'verify').returns(mockUser as any);

    sinon.stub(User, 'findById').resolves(mockUser as any);
    sinon.stub(BoardModel, 'findById').resolves({ _id: boardId } as any);

    sinon.stub(MemberModel, 'deleteOne').resolves({ deletedCount: 1 } as any);
    sinon.stub(BoardInviteModel, 'deleteMany').resolves({ deletedCount: 1 } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('DELETE /remove-member/:bid/:uid', async () => {
    it('should return 403 if user tries to remove themselves', async () => {
      const res = await server.delete(`${API_URL}/member/remove-member/${boardId}/${mockUser._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('You cannot remove yourself');
    });

    it('should return 404 if target user not found', async () => {
      (User.findById as sinon.SinonStub).withArgs(targetUserId).resolves(null);

      const res = await server.delete(`${API_URL}/member/remove-member/${boardId}/${targetUserId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('User not found');
    });

    it('should return 404 if board not found', async () => {
      (BoardModel.findById as sinon.SinonStub).resolves(null);

      const res = await server.delete(`${API_URL}/member/remove-member/${boardId}/${targetUserId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('Board not found');
    });

    it('should return 403 if requesting user is not an admin', async () => {
      sinon.stub(MemberModel, 'findOne').resolves({ role: MEMBER_ROLES.MEMBER } as any);

      const res = await server.delete(`${API_URL}/member/remove-member/${boardId}/${targetUserId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('You do not have permission to remove members');
    });

    it('should return 502 if there is a DB error', async () => {
      sinon.stub(MemberModel, 'findOne').throws(new Error('Database failure'));

      const res = await server.delete(`${API_URL}/member/remove-member/${boardId}/${targetUserId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Database failure');
    });

    it('should remove member successfully and return 200', async () => {
      sinon.stub(MemberModel, 'findOne').resolves({ role: MEMBER_ROLES.ADMIN } as any);

      const res = await server.delete(`${API_URL}/member/remove-member/${boardId}/${targetUserId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.message).to.equal('Members removed successfully');
    });
  });

  describe('GET /member-list/:id', async () => {
    it('should return 200 and list of members if board exists', async () => {
      const boardId = new mongoose.Types.ObjectId().toString();

      const mockMembers = [
        {
          _id: new mongoose.Types.ObjectId(),
          boardId: { _id: boardId, name: 'Design Board' },
          workspaceId: { _id: new mongoose.Types.ObjectId(), name: 'Workspace A' },
          memberId: { _id: new mongoose.Types.ObjectId(), first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com' },
          role: MEMBER_ROLES.MEMBER,
        },
      ];

      const populateStub3 = sinon.stub().resolves(mockMembers);
      const populateStub2 = sinon.stub().returns({ populate: populateStub3 });
      const populateStub1 = sinon.stub().returns({ populate: populateStub2 });

      sinon.stub(MemberModel, 'find').returns({ populate: populateStub1 } as any);

      const res = await server.get(`${API_URL}/member/member-list/${boardId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data[0].boardId.name).to.equal('Design Board');
    });

    it('should return 502 if there is a DB error', async () => {
      const boardId = new mongoose.Types.ObjectId().toString();
      sinon.stub(MemberModel, 'find').throws(new Error('Database failure'));

      const res = await server.get(`${API_URL}/member/member-list/${boardId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Database failure');
    });
  });
});
