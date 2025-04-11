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

const statusMock = {
  _id: new mongoose.Types.ObjectId().toString(),
  name: 'Status-1',
  description: 'Dashboard and bugs',
  board_id: '67f78e4e22f51102298dce53',
};

const statusListmockData = [
  {
    _id: '67f78e6222f51102298dce5a',
    name: 'In Progress',
    description: 'new status in-progress',
    position: 1,
    board_id: {
      _id: '67f78e4e22f51102298dce53',
      name: 'K Test Board',
      description: '',
      createdBy: {
        _id: '67f74b031fb8c5dfe56d739f',
        first_name: 'Keyur Test New',
        middle_name: 'New1',
        last_name: 'Xyz',
        email: 'halog19278@exclussi.com',
      },
      workspaceId: {
        _id: '67f7539fd7105dd7f281ae0b',
        name: 'PBA',
        description: 'This is pass',
      },
    },
  },
];

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
    this.timeout(7000);

    it('should status create successfully', function (done) {
      sinon.stub(BoardModel, 'findById').resolves(mockBoard as any);
      sinon.stub(User, 'findOne').resolves(mockUser as any);
      sinon.stub(StatusModel, 'create').resolves(statusMock as any);

      server
        .post(`${API_URL}/status/create-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Status-1',
          description: 'Dashboard and bugs',
          board_id: '67f78e4e22f51102298dce53',
        })
        .expect(201)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Status successfully created');
          done();
        });
    });

    it('return error if status already exists', function (done) {
      sinon.stub(BoardModel, 'findById').resolves(mockBoard as any);
      sinon.stub(User, 'findOne').resolves(mockUser as any);
      sinon.stub(StatusModel, 'findOne').resolves(statusMock as any);

      server
        .post(`${API_URL}/status/create-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          name: 'Status-1',
          description: 'New description but same name',
          board_id: '67f78e4e22f51102298dce53',
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

    it('should return validation error', (done) => {
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

  describe('PUT /update status', () => {
    this.timeout(7000);

    it('should update status successfully with name and description', function (done) {
      const statusMock = {
        _id: 'status123',
        name: 'Old Name',
        description: 'Old Desc',
        position: 1,
        board_id: 'board123',
        save: sinon.stub().resolves(),
      };

      sinon.stub(StatusModel, 'findById').resolves(statusMock as any);

      server
        .put(`${API_URL}/status/update-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          statusId: 'status123',
          name: 'New Name',
          description: 'New Desc',
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Status updated successfully');
          done();
        });
    });

    it('should reorder statuses successfully when newPosition is provided', function (done) {
      const statusMock = {
        _id: 'status123',
        position: 1,
        board_id: 'board123',
        save: sinon.stub().resolves(),
      };

      const allStatuses = [{ _id: 'status111', position: 1 }, statusMock, { _id: 'status222', position: 2 }];

      sinon.stub(StatusModel, 'findById').resolves(statusMock as any);
      sinon.stub(StatusModel, 'find').returns({
        sort: sinon.stub().returns(Promise.resolve(allStatuses)),
      } as any);
      sinon.stub(StatusModel, 'bulkWrite').resolves();

      server
        .put(`${API_URL}/status/update-status`)
        .set('Cookie', ['access_token=token'])
        .send({
          statusId: 'status123',
          newPosition: 2,
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Status positions reordered successfully');
          done();
        });
    });

    it('should return 400 if statusId is missing', function (done) {
      server
        .put(`${API_URL}/status/update-status`)
        .set('Cookie', ['access_token=token'])
        .send({})
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('statusId is required');
          done();
        });
    });

    it('should return 404 if status not found', function (done) {
      sinon.stub(StatusModel, 'findById').resolves(null);

      server
        .put(`${API_URL}/status/update-status`)
        .set('Cookie', ['access_token=token'])
        .send({ statusId: 'invalid123' })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Status not found');
          done();
        });
    });
  });

  describe('GET /get status', () => {
    let statusFindStub: sinon.SinonStub;
    it('should get status list successfully', function (done) {
      const boardId = '67f78e4e22f51102298dce53';

      statusFindStub = sinon.stub(StatusModel, 'find').returns({
        sort: sinon.stub().returns({
          populate: sinon.stub().resolves(statusListmockData),
        }),
      } as any);

      server
        .get(`${API_URL}/status/get-status?boardId=${boardId}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Status successfully fetched');
          expect(res.body.data).to.be.an('array');
          expect(res.body.data[0]).to.have.property('name', 'In Progress');
          expect(res.body.data[0].board_id).to.have.property('name', 'K Test Board');
          done();
        });
    });
    it('should return 502 if StatusModel.find throws an error', function (done) {
      const boardId = '67f78e4e22f51102298dce53';

      const errorMessage = 'Database error';
      sinon.stub(StatusModel, 'find').throws(new Error(errorMessage));

      server
        .get(`${API_URL}/status/get-status?boardId=${boardId}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal(errorMessage);
          done();
        });
    });
  });

  describe('Delete /delete status', () => {
    it('should delete a board and its members and invites', async () => {
      const createdStatus = {
        _id: new mongoose.Types.ObjectId().toString(),
        name: 'Status-1',
        description: 'Dashboard and bugs',
        board_id: '67f78e4e22f51102298dce53',
      };
      sinon.stub(StatusModel, 'findOne').resolves(statusMock as any);
      sinon.stub(StatusModel, 'findByIdAndDelete').resolves(statusMock as any);

      const res = await server.delete(`${API_URL}/status/delete-status/${statusMock._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Status successfully deleted');
    });
  });
});
