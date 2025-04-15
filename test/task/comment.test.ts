import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { TaskModel } from '../../src/model/task.model';
import { getSocket } from '../../src/config/socketio.config';
import { CommentModel } from '../../src/model/comment.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

const taskId = 'task1';
const comment = 'New Comment';
const mockTask = {
  _id: taskId,
  comment: 'New Comment',
};

const newLabel: any = {
  _id: 'newTaskLabelId',
  task_id: taskId,
  comment: 'New comment 2',
};

describe('Comment Management API', function () {
  this.timeout(7000);
  let findStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Post /comment/add', () => {
    it('should add a task member if not already added', async () => {
      sinon.stub(TaskModel, 'findOne').withArgs({ _id: taskId }).resolves(mockTask);
      sinon.stub(CommentModel, 'create').resolves(newLabel);
      const emitStub = sinon.stub();
      sinon.stub(getSocket(), 'io').value({ to: () => ({ emit: emitStub }) });

      await server
        .post(`${API_URL}/comment/add`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({ task_id: taskId, comment: comment })
        .expect(201)
        .then((res) => {
          expect(res.body.message).to.equal('Comment successfully added');
        });
    });

    it('should return error if task not found', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves(null);

      server
        .post(`${API_URL}/comment/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, comment: comment })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
          done();
        });
    });
    it('should return validation error', (done) => {
      sinon.stub(CommentModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/comment/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: '', comment: comment })

        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task id is required');
          done();
        });
    });
    it('should return 502 on DB error', (done) => {
      sinon.stub(TaskModel, 'findOne').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/comment/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, comment: comment })

        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });
  });

  describe('GET /comment/get', () => {
    let taskLabelFindStub: sinon.SinonStub;
    it('should get task label successfully', function (done) {
      taskLabelFindStub = sinon.stub(CommentModel, 'find').returns({
        populate: sinon
          .stub()
          .returnsThis()
          .resolves([
            {
              _id: '67fd005ba9feb965f6cb47d8',
              comment: 'New Welcome',
              task_id: {
                _id: '67f8c042bba597c4d51a5a7b',
                title: 'Signup updated 12',
                description: 'hello',
                board_id: '67f78e4e22f51102298dce53',
                status_list_id: '67f78d73629136b8f23f0247',
                position: 2,
              },
              commented_by: {
                _id: '67f74b031fb8c5dfe56d739f',
                first_name: 'Keyur Test New',
                middle_name: 'New1',
                last_name: 'Xyz',
                email: 'halog19278@exclussi.com',
                profile_image: '',
                status: true,
              },
              createdAt: '2025-04-14T12:32:27.798Z',
              updatedAt: '2025-04-14T12:36:24.072Z',
              __v: 0,
            },
          ]),
      } as any);

      server
        .get(`${API_URL}/comment/get/121`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.message).to.equal('Comment successfully fetched');
          done();
        });
    });
  });

  describe('Update /comment/update profile', () => {
    it('should update comment successfully', function (done) {
      sinon.stub(CommentModel, 'findByIdAndUpdate').returns({
        select: sinon.stub().resolves({
          _id: '67f74b031fb8c5dfe56d739f',
          email: 'test@example.com',
        }),
      } as any);

      server
        .put(`${API_URL}/comment/update/67f74b031fb8c5dfe56d739f`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          comment: 'Test Comment Updated',
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Comment successfully updated');
          done();
        });
    });
    it('should return 502 if bad gateway', (done) => {
      sinon.stub(CommentModel, 'findByIdAndUpdate').resolves(null);

      server
        .put(`${API_URL}/comment/update/121`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          comment: 'Test New Updated',
        })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          done();
        });
    });
  });

  describe('DELETE /comment/delete/:id', () => {
    it('should delete a task lable by ID', async () => {
      const commentId = 'tm1';

      sinon.stub(CommentModel, 'findOne').withArgs({ _id: commentId }).resolves({ _id: commentId });

      const sessionStub: any = {
        startTransaction: sinon.stub(),
        commitTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      };

      sinon.stub(mongoose, 'startSession').resolves(sessionStub as any);
      sinon.stub(CommentModel, 'findByIdAndDelete').withArgs({ _id: commentId }, { session: sessionStub }).resolves({ _id: commentId });

      await server
        .delete(`${API_URL}/comment/delete/${commentId}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .then((res) => {
          expect(res.body.message).to.equal('Comment successfully removed');
        });
    });
    it('should return 400 if task not found', (done) => {
      const findOneStub = sinon.stub(CommentModel, 'findOne').resolves(null);
      const startSessionStub = sinon.stub(mongoose, 'startSession').resolves({
        startTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      } as any);

      server
        .delete(`${API_URL}/comment/delete/121`)
        .set('Cookie', ['access_token=token'])
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Comment not found..!');
          findOneStub.restore();
          startSessionStub.restore();
          done();
        });
    });
    it('should return 502 on internal error', (done) => {
      const errorMessage = 'Something went wrong';

      const startSessionStub = sinon.stub(mongoose, 'startSession').resolves({
        startTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      } as any);

      const findOneStub = sinon.stub(CommentModel, 'findOne').throws(new Error(errorMessage));

      server
        .delete(`${API_URL}/comment/delete/121`)
        .set('Cookie', ['access_token=token'])
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal(errorMessage);
          findOneStub.restore();
          startSessionStub.restore();
          done();
        });
    });
  });
});
