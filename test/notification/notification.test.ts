import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { NotificationModel } from '../../src/model/notification.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

describe('Members API', () => {
  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /notification/notification-list', async () => {
    it('should return notifications for the authenticated user', async () => {
      const sortStub = sinon.stub().returnsThis();
      const populateStub = sinon.stub().resolves([
        {
          _id: new mongoose.Types.ObjectId(),
          message: 'Test message 2',
          action: 'INVITE_ACCEPTED',
          read: true,
          receiver: mockUser._id,
          sender: { first_name: 'Bob', last_name: 'Johnson', email: 'bob@example.com' },
          createdAt: new Date(),
        },
      ]);

      sinon.stub(NotificationModel, 'find').returns({
        sort: sortStub,
        populate: populateStub,
      } as any);

      const res = await server.get(`${API_URL}/notification/notification-list`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Notification successfully fetched');
      expect(res.body.data).to.be.an('array');
    });

    it('should return empty array when there is no notification', async () => {
      const sortStub = sinon.stub().returnsThis();
      const populateStub = sinon.stub().resolves([]);

      sinon.stub(NotificationModel, 'find').returns({
        sort: sortStub,
        populate: populateStub,
      } as any);

      const res = await server.get(`${API_URL}/notification/notification-list`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Notification successfully fetched');
      expect(res.body.data).to.be.an('array');
    });

    it('should handle internal server error gracefully', async () => {
      const sortStub = sinon.stub().returnsThis();
      const populateStub = sinon.stub().throws(new Error('Something went wrong'));

      sinon.stub(NotificationModel, 'find').returns({
        sort: sortStub,
        populate: populateStub,
      } as any);

      const res = await server.get(`${API_URL}/notification/notification-list`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(502);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Something went wrong');
    });
  });
});
