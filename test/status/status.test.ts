import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { BoardModel } from '../../src/model/board.model';
import { StatusModel } from '../../src/model/status.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
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

describe('Status Management API', function () {
  this.timeout(7000);

  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /create status', () => {
    it('return error if status already exists', function (done) {
      sinon.stub(BoardModel, 'findById').resolves(mockBoard as any);
      sinon.stub(User, 'findOne').resolves(mockUser as any);
      const uniqueName = `Status-${Math.floor(Math.random() * 1000)}`;
      server
        .post(`${API_URL}/status/create-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: uniqueName,
          description: 'Dashboard and bugs',
          board_id: '67f75456d5a5094c2f31e7c1',
        })
        .expect(201)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Status successfully created');
          done();
        });
    });

    it('should', function (done) {
      sinon.stub(BoardModel, 'findById').resolves(mockBoard as any);
      sinon.stub(User, 'findOne').resolves(mockUser as any);

      server
        .post(`${API_URL}/status/create-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Status-1',
          description: 'New description but same name',
          board_id: '67f75456d5a5094c2f31e7c1',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Status already exists..!');
          done();
        });
    });

    it('should return 502 on unexpected DB error', (done) => {
      sinon.stub(StatusModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/status/create-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
          board_id: '67f632a547cdbb5b53b28718',
        })
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });

    it('should return 502 on unexpected DB error', (done) => {
      sinon.stub(StatusModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/status/create-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Sprint 1',
          description: 'Dashboard and bugs',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Board id is required');
          done();
        });
    });
  });
});
