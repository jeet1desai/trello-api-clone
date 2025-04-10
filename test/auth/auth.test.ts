import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import bcryptJS from 'bcryptjs';
import * as emailHelper from '../../src/utils/sendEmail';
import * as validator from '../../src/utils/validation.utils';
import Joi from 'joi';
import * as tokenUtil from '../../src/utils/generateTokens';
import * as verifyRefreshTokenUtil from '../../src/utils/verifyRefreshToken';
import * as sendEmailUtil from '../../src/utils/verifyRefreshToken';
const ejs = require('ejs');

describe('Authentication API', () => {
  const fakeUserData = {
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    password: 'password123',
  };

  afterEach(() => {
    sinon.restore();
  });

  describe('POST1 /signup', async () => {
    it('should signup successfully', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves(null);
      sinon.stub(bcryptJS, 'genSalt').resolves('fakesalt');
      sinon.stub(bcryptJS, 'hash').resolves('hashedpassword');

      sinon.stub(User, 'create').resolves({
        ...fakeUserData,
        _id: 'user123',
        save: sinon.stub().resolvesThis(),
      } as any);

      sinon.stub(jwt, 'sign').returns('fake-jwt-token' as any);
      sinon.stub(emailHelper, 'sendEmail').resolves();

      server
        .post(`${API_URL}/auth/signup`)
        .send(fakeUserData)
        .expect(201)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('User successfully registered..!');
          done();
        });
    });
    it('should signup validation error', (done) => {
      const schema = Joi.object({
        first_name: Joi.string().required(),
      });

      const fakeValidationError = schema.validate({}, { abortEarly: false }).error;

      sinon.stub(validator, 'validateRequest').throws(fakeValidationError);

      server
        .post(`${API_URL}/auth/signup`)
        .send({})
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('"first_name" is required');
          done();
        });
    });
    it('should return 400 if user already exists', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({ email: 'test@example.com' } as any);

      server
        .post(`${API_URL}/auth/signup`)
        .send(fakeUserData)
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('User already exists..!');
          done();
        });
    });
    it('should handle unexpected server errors', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').throws(new Error('Unexpected'));

      server
        .post(`${API_URL}/auth/signup`)
        .send(fakeUserData)
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('Unexpected');
          done();
        });
    });
  });

  describe('POST1 /signin', () => {
    it('should signin successfully', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({ ...fakeUserData, password: 'hashedPassword', status: true } as any);
      sinon.stub(bcryptJS, 'compare').resolves(true);
      sinon.stub(tokenUtil, 'default').resolves({
        accessToken: 'fakeAccessToken',
        refreshToken: 'fakeRefreshToken',
      });

      server
        .post(`${API_URL}/auth/signin`)
        .send({ email: fakeUserData.email, password: fakeUserData.password })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('Login successful..!');
          expect(res.body.data).to.have.property('accessToken');
          expect(res.body.data).to.have.property('refreshToken');
          done();
        });
    });
    it('should signin validation error', (done) => {
      const schema = Joi.object({
        email: Joi.string().required(),
      });

      const fakeValidationError = schema.validate({}, { abortEarly: false }).error;

      sinon.stub(validator, 'validateRequest').throws(fakeValidationError);

      server
        .post(`${API_URL}/auth/signin`)
        .send({})
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('"email" is required');
          done();
        });
    });

    it('should user not found error', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves(null);

      server
        .post(`${API_URL}/auth/signin`)
        .send({ email: 'nouser@example.com', password: 'pass123' })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('User not found..!');
          done();
        });
    });

    it('should user not verified error', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({ email: 'test@example.com', status: false, password: 'somehash' } as any);

      server
        .post(`${API_URL}/auth/signin`)
        .send({ email: 'test@example.com', password: 'pass123' })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('The user has not verified their email..!');
          done();
        });
    });

    it('should return invalid password', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({ email: 'test@example.com', status: true, password: 'wronghash' } as any);
      sinon.stub(bcryptJS, 'compare').resolves(false);

      server
        .post(`${API_URL}/auth/signin`)
        .send({ email: 'test@example.com', password: 'wrongpass' })
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Invalid username or password..!');
          done();
        });
    });

    it('should handle unexpected server errors', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').throws(new Error('Unexpected'));

      server
        .post(`${API_URL}/auth/signin`)
        .send(fakeUserData)
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('Unexpected');
          done();
        });
    });
  });

  describe('POST /refresh-token', function () {
    this.timeout(7000);

    it('should refresh token successfully', (done) => {
      const fakeToken = 'valid-refresh-token';
      const fakeAccessToken = 'new-access-token';

      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(verifyRefreshTokenUtil, 'default').resolves({
        error: false,
        message: 'Token is valid',
        tokenDetails: {
          _id: 'user123',
          email: 'test@example.com',
          iat: 1234567890,
          exp: 1234569999,
        },
      });
      sinon.stub(jwt, 'sign').returns(fakeAccessToken as any);

      server
        .post(`${API_URL}/auth/refresh-token`)
        .send({ refreshToken: fakeToken })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Access token created successfully');
          expect(res.body.data.accessToken).to.equal(fakeAccessToken);
          done();
        });
    });
    it('should refresh token validation error', (done) => {
      const schema = Joi.object({
        token: Joi.string().required(),
      });

      const fakeValidationError = schema.validate({}, { abortEarly: false }).error;

      sinon.stub(validator, 'validateRequest').throws(fakeValidationError);

      server
        .post(`${API_URL}/auth/refresh-token`)
        .send({})
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('"token" is required');
          done();
        });
    });
    it('should handle internal server error', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').throws(new Error('DB error'));

      server
        .post(`${API_URL}/auth/refresh-token`)
        .send({ email: 'test@example.com' })
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('POST /forgot-password', () => {
    it('should send OTP successfully', function (done) {
      this.timeout(5000);
      const fakeUser = {
        email: 'test@example.com',
        save: sinon.stub().resolves(),
      };

      sinon.stub(User, 'findOne').resolves(fakeUser);
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(ejs, 'renderFile').resolves('<p>Your OTP is 123456</p>');
      sinon.stub(sendEmailUtil, 'default').resolves();

      server
        .post(`${API_URL}/auth/forgot-password`)
        .send({ email: 'test@example.com' })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('We have sent you otp to your email..!');
          done();
        });
    });
    it('should return 400 if user not found', (done) => {
      sinon.stub(User, 'findOne').resolves(null);
      sinon.stub(validator, 'validateRequest').resolves();

      server
        .post(`${API_URL}/auth/forgot-password`)
        .send({ email: 'unknown@example.com' })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('User not found..!');
          done();
        });
    });
    it('should signin validation error', (done) => {
      const schema = Joi.object({
        email: Joi.string().required(),
      });

      const fakeValidationError = schema.validate({}, { abortEarly: false }).error;

      sinon.stub(validator, 'validateRequest').throws(fakeValidationError);

      server
        .post(`${API_URL}/auth/forgot-password`)
        .send({})
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('"email" is required');
          done();
        });
    });
    it('should handle internal server error', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').throws(new Error('DB error'));

      server
        .post(`${API_URL}/auth/forgot-password`)
        .send({ email: 'test@example.com' })
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('POST /auth/change-password', function () {
    this.timeout(7000);

    const changePasswordEndpoint = `${API_URL}/auth/change-password`;

    const fakeUser = {
      email: 'test@example.com',
      otp: 123456,
      otp_expire: new Date(Date.now() + 5 * 60 * 1000),
      password: 'hashedpassword',
      save: sinon.stub().resolves(),
    };

    const newPassword = 'NewPassword@123';
    const hashedPassword = 'hashedNewPassword';

    afterEach(() => {
      sinon.restore();
    });

    it('should successfully change password', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({ ...fakeUser, otp: 123456 });
      sinon.stub(bcryptJS, 'genSalt').resolves('salt');
      sinon.stub(bcryptJS, 'hash').resolves(hashedPassword);

      server
        .post(changePasswordEndpoint)
        .send({
          email: fakeUser.email,
          otp: 123456,
          password: newPassword,
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('New password successfully updated..!');
          done();
        });
    });

    it('should return error if user not found', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves(null);

      server
        .post(changePasswordEndpoint)
        .send({
          email: fakeUser.email,
          otp: 123456,
          password: newPassword,
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('User not found..!');
          done();
        });
    });

    it('should return error if OTP expired', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({
        ...fakeUser,
        otp_expire: new Date(Date.now() - 1000),
      });

      server
        .post(changePasswordEndpoint)
        .send({
          email: fakeUser.email,
          otp: 123456,
          password: newPassword,
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('OTP has expired. Please request a new one..!');
          done();
        });
    });

    it('should return error if OTP does not match', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').resolves({
        ...fakeUser,
        otp: 999999, // wrong otp
      });

      server
        .post(changePasswordEndpoint)
        .send({
          email: fakeUser.email,
          otp: 123456,
          password: newPassword,
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('Invalid OTP..!');
          done();
        });
    });

    it('should return validation error if request is invalid', (done) => {
      const schema = Joi.object({
        email: Joi.string().required(),
      });

      const fakeValidationError = schema.validate({}, { abortEarly: false }).error;

      sinon.stub(validator, 'validateRequest').throws(fakeValidationError);

      server
        .post(changePasswordEndpoint)
        .send({})
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('"email" is required');
          done();
        });
    });

    it('should handle internal server error', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(User, 'findOne').throws(new Error('DB error'));

      server
        .post(changePasswordEndpoint)
        .send({ email: 'test@example.com' })
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('POST /auth/reset-password', function () {
    beforeEach(() => {
      sinon.stub(jwt, 'verify').returns({ _id: 'test-user-id', email: 'test@example.com' } as any);
      sinon.stub(User, 'findById').resolves({ _id: 'test-user-id', email: 'test@example.com' } as any);
    });

    this.timeout(7000);

    const endpoint = `${API_URL}/auth/reset-password`;

    const oldPassword = 'OldPass@123';
    const newPassword = 'NewPass@456';
    const fakeUser = {
      _id: 'user123',
      email: 'test@example.com',
      password: 'hashedOldPassword',
    };

    const updatedUser = {
      ...fakeUser,
      password: 'hashedNewPassword',
    };

    afterEach(() => {
      sinon.restore();
    });

    it('should reset password successfully', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(bcryptJS, 'compare').resolves(true);
      sinon.stub(bcryptJS, 'genSalt').resolves('salt');
      sinon.stub(bcryptJS, 'hash').resolves('hashedNewPassword');
      sinon.stub(User, 'findByIdAndUpdate').resolves(updatedUser);

      server
        .post(endpoint)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          old_password: oldPassword,
          new_password: newPassword,
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('New password successfully updated..!');
          expect(res.body.data).to.deep.equal(updatedUser);
          done();
        });
    });

    it('should return error if old password is incorrect', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(bcryptJS, 'compare').resolves(false);

      server
        .post(endpoint)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          old_password: oldPassword,
          new_password: newPassword,
        })
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.include('Incorrect old password');
          done();
        });
    });

    it('should return error if user not found during update', (done) => {
      sinon.stub(validator, 'validateRequest').resolves();
      sinon.stub(bcryptJS, 'compare').resolves(true);
      sinon.stub(bcryptJS, 'genSalt').resolves('salt');
      sinon.stub(bcryptJS, 'hash').resolves('hashedNewPassword');
      sinon.stub(User, 'findByIdAndUpdate').resolves(null);

      server
        .post(endpoint)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          old_password: oldPassword,
          new_password: newPassword,
        })
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).to.equal('User not found..!');
          done();
        });
    });
  });

  describe('POST /verify-email', function () {
    this.timeout(7000);
    afterEach(() => {
      sinon.restore();
    });
    it('should verify email successfully', function (done) {
      this.timeout(5000);

      const fakeToken = 'valid-token';
      const decodedUserId = 'user123';
      const fakeUser = {
        _id: decodedUserId,
        email: 'test@example.com',
        email_token: fakeToken,
        is_email_verified: false,
        status: false,
        email_token_expires_at: new Date(),
        save: sinon.stub().resolves(),
      };

      sinon.stub(jwt, 'verify').returns({ userId: decodedUserId } as any);
      sinon.stub(User, 'findById').resolves(fakeUser);

      server
        .post(`${API_URL}/auth/verify-email`)
        .send({ token: fakeToken })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Email verified successfully..!');
          done();
        });
    });
    it('should handle expired token and send new verification email', function (done) {
      const expiredToken = 'expired-token';
      const decodedUserId = 'user123';
      const newToken = 'new-token';

      const fakeUser = {
        _id: decodedUserId,
        email: 'test@example.com',
        email_token: expiredToken,
        save: sinon.stub().resolves(),
      };

      sinon.stub(jwt, 'verify').throws({ name: 'TokenExpiredError' });
      sinon.stub(jwt, 'decode').returns({ userId: decodedUserId });
      sinon.stub(User, 'findById').resolves(fakeUser);
      sinon.stub(jwt, 'sign').returns(newToken as any);
      sinon.stub(ejs, 'renderFile').resolves('<p>Verify</p>');
      sinon.stub(sendEmailUtil, 'default').resolves();

      server
        .post(`${API_URL}/auth/verify-email`)
        .send({ token: expiredToken })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Token expired. New verification link sent..!');
          done();
        });
    });
    it('should return user not found', function (done) {
      sinon.stub(jwt, 'verify').returns({ userId: 'unknown' } as any);
      sinon.stub(User, 'findById').resolves(null);

      server
        .post(`${API_URL}/auth/verify-email`)
        .send({ token: 'any-token' })
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('User not found..!');
          done();
        });
    });
    it('should fail with invalid token', function (done) {
      sinon.stub(jwt, 'verify').throws({ name: 'JsonWebTokenError' });

      server
        .post(`${API_URL}/auth/verify-email`)
        .send({ token: 'invalid-token' })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Invalid token...!');
          done();
        });
    });
  });

  describe('GET /logout', () => {
    it('should logout user successfully', function (done) {
      this.timeout(5000);

      server
        .get(`${API_URL}/auth/logout`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Logged out successfully..!');

          const setCookies = res.header['set-cookie'] as unknown as string[];
          expect(setCookies.some((cookie: string) => cookie.includes('access_token=;'))).to.be.true;
          expect(setCookies.some((cookie: string) => cookie.includes('refresh_token=;'))).to.be.true;

          done();
        });
    });
  });
});
