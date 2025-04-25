import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import { WorkSpaceModel } from '../../src/model/workspace.model';
import User from '../../src/model/user.model';
import { MemberModel } from '../../src/model/members.model';
import { MEMBER_ROLES } from '../../src/config/app.config';
import mongoose from 'mongoose';
import * as recentActivityService from '../../src/helper/recentActivityService'; // update path accordingly

describe('Workspace API', () => {
  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns({ _id: 'test-user-id', email: 'test@example.com' } as any);
    sinon.stub(User, 'findById').resolves({ _id: 'test-user-id', email: 'test@example.com' } as any);
  });

  afterEach(() => {
    sinon.restore(); // Clean stubs after each test
  });

  describe('POST /create-workspace', async () => {
    it('should create a workspace successfully', (done) => {
      sinon.stub(WorkSpaceModel, 'create').resolves({
        name: 'Test Workspace',
        description: 'Test workspace description',
        createdBy: '67f3cb9504aa115c061c0634',
        _id: '67f4e6d9688da016b404959f',
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      } as any);

      sinon.stub(recentActivityService, 'saveRecentActivity').resolves({} as any);

      server
        .post(`${API_URL}/workspace/create-workspace`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          name: 'Test Workspace',
          description: 'Test workspace description',
        })
        .expect(201)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Workspace successfully created');
          expect(res.body.data).to.have.property('_id');
          expect(res.body.data.name).to.equal('Test Workspace');
          done();
        });
    });

    it('should return an error if workspace creation fails', (done) => {
      sinon.stub(WorkSpaceModel, 'create').rejects(new Error('DB Error'));

      server
        .post(`${API_URL}/workspace/create-workspace`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          name: 'Test Workspace',
          description: 'Test workspace description',
        })
        .expect(502) // BAD_GATEWAY
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB Error');
          done();
        });
    });

    it('should return validation error if name is missing', (done) => {
      server
        .post(`${API_URL}/workspace/create-workspace`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          // name is missing, which is required
          description: 'Test workspace description',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace name is required');
          done();
        });
    });
  });

  describe('PUT /update-workspace/:id', async () => {
    it('should updated a workspace successfully', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndUpdate').resolves({
        name: 'Test Workspace Updated',
        description: 'Test workspace description Updated',
        createdBy: '67f3cb9504aa115c061c0634',
        _id: '67f4e6d9688da016b404959f',
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      } as any);

      sinon.stub(recentActivityService, 'saveRecentActivity').resolves({} as any);

      server
        .put(`${API_URL}/workspace/update-workspace/67f4e6d9688da016b404959f`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          name: 'Test Workspace Updated',
          description: 'Test workspace description Updated',
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Workspace successfully updated');
          expect(res.body.data).to.have.property('_id');
          expect(res.body.data.name).to.equal('Test Workspace Updated');
          done();
        });
    });

    it('should return 400 if name is missing', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndUpdate').throws(new Error('Database failure'));

      server
        .put(`${API_URL}/workspace/update-workspace/67f4e6d9688da016b404959g`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          name: 'Test Workspace Updated',
          description: 'Test workspace description Updated',
        })
        .expect(400)
        .end((err, res) => {
          done();
        });
    });

    it('should return 404 if workspace is not found', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndUpdate').resolves(null);

      server
        .put(`${API_URL}/workspace/update-workspace/invalid-id`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          name: 'Test Workspace Updated',
          description: 'Test workspace description Updated',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });
  });

  describe('DELETE /delete-workspace/:id', async () => {
    it('should delete the workspace successfully', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndDelete').resolves({
        _id: 'workspace123',
        name: 'Test Workspace',
        createdBy: 'user123',
      } as any);
      sinon.stub(recentActivityService, 'saveRecentActivity').resolves({} as any);

      server
        .delete(`${API_URL}/workspace/delete-workspace/workspace123`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Workspace successfully deleted');
          expect(res.body.data).to.have.property('_id', 'workspace123');
          done();
        });
    });

    it('should return 502 if deletion fails due to error', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndDelete').rejects(new Error('DB Failure'));

      server
        .delete(`${API_URL}/workspace/delete-workspace/workspace123`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB Failure');
          done();
        });
    });

    it('should return 404 if workspace is not found', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndDelete').resolves(null);

      server
        .delete(`${API_URL}/workspace/delete-workspace/invalid-id`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });
  });

  describe('GET /workspace/get-workspace/:id', () => {
    it('should return workspace details successfully', async () => {
      const workspaceId = new mongoose.Types.ObjectId();
      const mockWorkspace = { _id: workspaceId, name: 'Test Workspace', createdBy: 'user123' };
      const populateStub3 = sinon.stub().resolves(mockWorkspace);
      const populateStub1 = sinon.stub().returns({ populate: populateStub3 });
      sinon.stub(WorkSpaceModel, 'findById').returns({ populate: populateStub1 } as any);

      const res = await server.get(`${API_URL}/workspace/get-workspace/${workspaceId}`).set('Cookie', [`access_token=token`]);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Workspace successfully fetched');
    });

    it('should return 404 if workspace not found', (done) => {
      const populateStub = sinon.stub().resolves(null);
      sinon.stub(WorkSpaceModel, 'findById').returns({ populate: populateStub } as any);

      server
        .get(`${API_URL}/workspace/get-workspace/${new mongoose.Types.ObjectId()}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });

    it('should return 502 if an error occurs while fetching workspace', (done) => {
      const populateStub = sinon.stub().rejects(new Error('DB error'));
      sinon.stub(WorkSpaceModel, 'findById').returns({ populate: populateStub } as any);

      server
        .get(`${API_URL}/workspace/get-workspace/${new mongoose.Types.ObjectId()}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });
  });

  describe('GET /workspace/get-workspaces', () => {
    it('should return workspace list successfully', (done) => {
      sinon.stub(MemberModel, 'find').resolves([] as any);

      const mockWorkspaces = [{ _id: 'workspace123', name: 'Test Workspace', createdBy: 'user123' }];
      const populateStub3 = sinon.stub().resolves(mockWorkspaces);
      const populateStub1 = sinon.stub().returns({ populate: populateStub3 });
      sinon.stub(WorkSpaceModel, 'find').returns({ populate: populateStub1 } as any);

      server
        .get(`${API_URL}/workspace/get-workspaces`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Workspace successfully fetched');
          done();
        });
    });

    it('should return workspaces where the user is a member', (done) => {
      sinon.stub(MemberModel, 'find').resolves([{ workspaceId: 'ws2', memberId: 'test-user-id', role: MEMBER_ROLES.MEMBER }] as any);

      const mockWorkspaces = [{ _id: 'workspace123', name: 'Test Workspace', createdBy: 'user123' }];
      const populateStub3 = sinon.stub().resolves(mockWorkspaces);
      const populateStub1 = sinon.stub().returns({ populate: populateStub3 });
      sinon.stub(WorkSpaceModel, 'find').returns({ populate: populateStub1 } as any);

      server
        .get(`${API_URL}/workspace/get-workspaces`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Workspace successfully fetched');
          done();
        });
    });

    it('should return empty list if user has no workspaces', async () => {
      sinon.stub(MemberModel, 'find').resolves([] as any);
      const populateStub3 = sinon.stub().resolves([] as any);
      const populateStub1 = sinon.stub().returns({ populate: populateStub3 });
      sinon.stub(WorkSpaceModel, 'find').returns({ populate: populateStub1 } as any);

      const res = await server.get(`${API_URL}/workspace/get-workspaces`).set('Cookie', ['access_token=fake-jwt-token']);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Workspace successfully fetched');
    });

    it('should handle internal server error', (done) => {
      sinon.stub(MemberModel, 'find').rejects(new Error('DB error'));

      server
        .get(`${API_URL}/workspace/get-workspaces`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });
  });
});
