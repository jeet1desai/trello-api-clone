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
import { LabelModel } from '../../src/model/label.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

const mockLabel = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Old Label',
  backgroundColor: '#000000',
  textColor: '#FFFFFF',
  boardId: new mongoose.Types.ObjectId(),
  createdBy: mockUser._id,
  save: sinon.stub().resolvesThis(),
};

describe('Label API', () => {
  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /create-label', async () => {
    it('should return 400 on validation error', async () => {
      const res = await server.post(`${API_URL}/label/create-label`).set('Cookie', [`access_token=token`]).send({});

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
    });

    it('should return 404 if board not found', async () => {
      sinon.stub(BoardModel, 'findById').resolves(null);

      const res = await server.post(`${API_URL}/label/create-label`).set('Cookie', [`access_token=token`]).send({
        name: 'Label 1',
        background_color: '#FF0000',
        text_color: '#000000',
        board: new mongoose.Types.ObjectId().toString(),
      });

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Board not found');
    });

    it('should return 201 when label is successfully created', async () => {
      sinon.stub(BoardModel, 'findById').resolves({ _id: new mongoose.Types.ObjectId() } as any);

      const mockLabel = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Label 1',
        backgroundColor: '#FF0000',
        textColor: '#000000',
        boardId: new mongoose.Types.ObjectId(),
        createdBy: mockUser._id,
      };

      sinon.stub(LabelModel, 'create').resolves([mockLabel] as any);

      const res = await server.post(`${API_URL}/label/create-label`).set('Cookie', [`access_token=token`]).send({
        name: 'Label 1',
        background_color: '#FF0000',
        text_color: '#000000',
        board: new mongoose.Types.ObjectId().toString(),
      });

      expect(res.status).to.equal(201);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Label successfully created');
      expect(res.body.data.name).to.equal('Label 1');
    });

    it('should return 502 if internal error occurs', async () => {
      sinon.stub(BoardModel, 'findById').throws(new Error('Something went wrong'));

      const res = await server.post(`${API_URL}/label/create-label`).set('Cookie', [`access_token=token`]).send({
        name: 'Label 1',
        background_color: '#FF0000',
        text_color: '#000000',
        board: new mongoose.Types.ObjectId().toString(),
      });

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.include('Something went wrong');
    });
  });

  describe('PUT /update-label/:id', async () => {
    it('should update the label successfully', async () => {
      sinon.stub(LabelModel, 'findById').resolves(mockLabel as any);

      const res = await server.put(`${API_URL}/label/update-label/${mockLabel._id}`).set('Cookie', [`access_token=token`]).send({
        name: 'Updated Label',
        background_color: '#FF0000',
        text_color: '#000000',
      });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Label successfully updated');
    });

    it('should return 404 if label not found', async () => {
      sinon.stub(LabelModel, 'findById').resolves(null);

      const res = await server.put(`${API_URL}/label/update-label/${new mongoose.Types.ObjectId()}`).set('Cookie', [`access_token=token`]).send({
        name: 'Updated Label',
        background_color: '#FF0000',
        text_color: '#000000',
      });

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Label not found');
    });

    it('should return 502 if internal error occurs', async () => {
      sinon.stub(LabelModel, 'findById').throws(new Error('Something went wrong'));

      const res = await server.put(`${API_URL}/label/update-label/${new mongoose.Types.ObjectId()}`).set('Cookie', [`access_token=token`]).send({
        name: 'Updated Label',
        background_color: '#FF0000',
        text_color: '#000000',
      });

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.include('Something went wrong');
    });
  });

  describe('DELETE /delete-label/:id', async () => {
    it('should delete the label successfully', async () => {
      sinon.stub(LabelModel, 'findById').resolves(mockLabel as any);
      const deleteStub = sinon.stub(LabelModel, 'deleteOne').resolves({ deletedCount: 1 } as any);

      const res = await server.delete(`${API_URL}/label/delete-label/${mockLabel._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Label successfully deleted');
      expect(deleteStub.calledOnce).to.be.true;
    });

    it('should return 403 if user is not the label creator', async () => {
      const anotherUserLabel = { ...mockLabel, createdBy: new mongoose.Types.ObjectId() };
      sinon.stub(LabelModel, 'findById').resolves(anotherUserLabel as any);

      const res = await server.delete(`${API_URL}/label/delete-label/${anotherUserLabel._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('You are not authorized to delete this label');
    });

    it('should return 404 if label not found', async () => {
      sinon.stub(LabelModel, 'findById').resolves(null);

      const res = await server.delete(`${API_URL}/label/delete-label/${new mongoose.Types.ObjectId()}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Label not found');
    });

    it('should return 502 if internal error occurs', async () => {
      sinon.stub(LabelModel, 'findById').throws(new Error('Something went wrong'));

      const res = await server.delete(`${API_URL}/label/delete-label/${new mongoose.Types.ObjectId()}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.include('Something went wrong');
    });
  });

  describe('GET /get-label/:id', async () => {
    it('should return label successfully', async () => {
      sinon.stub(LabelModel, 'findById').resolves(mockLabel as any);

      const res = await server.get(`${API_URL}/label/get-label/${mockLabel._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Label successfully fetched');
      expect(res.body.data).to.have.property('_id');
    });

    it('should return 404 if label not found', async () => {
      sinon.stub(LabelModel, 'findById').resolves(null);

      const res = await server.get(`${API_URL}/label/get-label/${new mongoose.Types.ObjectId()}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(404);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Label not found');
    });

    it('should return 502 on internal error', async () => {
      sinon.stub(LabelModel, 'findById').throws(new Error('Database error'));

      const res = await server.get(`${API_URL}/label/get-label/${mockLabel._id}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Database error');
    });
  });

  describe('GET /get-labels/:id', async () => {
    it('should return list of labels for a board', async () => {
      sinon.stub(LabelModel, 'find').resolves([mockLabel] as any);

      const res = await server.get(`${API_URL}/label/get-labels/${mockLabel.boardId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Labels successfully fetched');
      expect(res.body.data).to.be.an('array').that.is.not.empty;
    });

    it('should return empty array if no labels found', async () => {
      sinon.stub(LabelModel, 'find').resolves([]);

      const res = await server.get(`${API_URL}/label/get-labels/${new mongoose.Types.ObjectId()}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data).to.be.an('array').that.is.empty;
    });

    it('should return 502 on internal error', async () => {
      sinon.stub(LabelModel, 'find').throws(new Error('Query failed'));

      const res = await server.get(`${API_URL}/label/get-labels/${mockLabel.boardId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Query failed');
    });
  });
});
