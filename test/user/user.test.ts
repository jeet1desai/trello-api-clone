import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';

describe('User Management API', function () {
  this.timeout(7000);

  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns({ _id: '67f74b031fb8c5dfe56d739f', email: 'test@example.com' } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /user profile', () => {
    it('should get user profile successfully', function (done) {
      sinon.stub(User, 'findById').returns({
        select: sinon.stub().resolves({
          _id: '67f74b031fb8c5dfe56d739f',
          first_name: 'Keyur Test New',
          middle_name: 'New1',
          last_name: 'Xyz',
          email: 'halog19278@exclussi.com',
          profile_image: '',
          status: true,
        }),
      } as any);

      server
        .get(`${API_URL}/user/profile`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('User profile successfully fetched');
          expect(res.body.data).to.have.property('_id', '67f74b031fb8c5dfe56d739f');
          done();
        });
    });
  });

  describe('Update /user profile', () => {
    it('should get user profile successfully', function (done) {
      sinon.stub(User, 'findByIdAndUpdate').returns({
        select: sinon.stub().resolves({
          _id: '67f74b031fb8c5dfe56d739f',
          email: 'test@example.com',
        }),
      } as any);

      server
        .put(`${API_URL}/user/profile`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          first_name: 'Test Profile Updated',
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('User profile successfully updated');
          expect(res.body.data).to.have.property('_id', '67f74b031fb8c5dfe56d739f');
          done();
        });
    });
    it('should return 502 if bad gateway', (done) => {
      sinon.stub(User, 'findByIdAndUpdate').resolves(null);

      server
        .put(`${API_URL}/user/profile`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          first_name: 'Test Profile Updated',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          done();
        });
    });
    it('should return 404 if user is not found', function (done) {
      sinon.stub(User, 'findByIdAndUpdate').returns({
        select: sinon.stub().resolves(null),
      } as any);

      server
        .put(`${API_URL}/user/profile`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          first_name: 'Test',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('User not found');
          done();
        });
    });
  });
});
