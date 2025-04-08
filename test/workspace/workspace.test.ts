import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import { WorkSpaceModel } from '../../src/model/workspace.model';

describe('Workspace API', () => {
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

      server
        .post(`${API_URL}/workspace/create-workspace`)
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
  });

  describe('PUT /update-workspace/:id', async () => {
    it('should create a workspace successfully', (done) => {
      sinon.stub(WorkSpaceModel, 'findByIdAndUpdate').resolves({
        name: 'Test Workspace Updated',
        description: 'Test workspace description Updated',
        createdBy: '67f3cb9504aa115c061c0634',
        _id: '67f4e6d9688da016b404959f',
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      } as any);

      server
        .put(`${API_URL}/workspace/update-workspace/67f4e6d9688da016b404959f`)
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

      server
        .delete(`${API_URL}/workspace/delete-workspace/workspace123`)
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
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });
  });

  describe('GET /workspace/get-workspace/:id', () => {
    it('should return workspace details successfully', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').resolves({
        _id: 'workspace123',
        name: 'Test Workspace',
        createdBy: 'user123',
      } as any);

      server
        .get(`${API_URL}/workspace/get-workspace/workspace123`)
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Workspace successfully fetched');
          expect(res.body.data).to.have.property('_id', 'workspace123');
          done();
        });
    });

    it('should return 404 if workspace not found', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').resolves(null);

      server
        .get(`${API_URL}/workspace/get-workspace/invalid-id`)
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Workspace not found');
          done();
        });
    });

    it('should return 502 if an error occurs while fetching workspace', (done) => {
      sinon.stub(WorkSpaceModel, 'findById').rejects(new Error('DB error'));

      server
        .get(`${API_URL}/workspace/get-workspace/workspace123`)
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });
  });
});
