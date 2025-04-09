import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import { WorkSpaceModel } from '../../src/model/workspace.model';
import mongoose from 'mongoose';
import { BoardModel } from '../../src/model/board.model';
import { MemberModel } from '../../src/model/members.model';

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
  });
});
