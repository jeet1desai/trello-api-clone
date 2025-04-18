import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { TaskModel } from '../../src/model/task.model';
import { TaskMemberModel } from '../../src/model/taskMember.model';
import { getSocket } from '../../src/config/socketio.config';
import userMiddleware from '../../src/middleware/user.middleware';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

const taskId = 'task1';
const memberId = 'member1';
const mockTask = {
  _id: taskId,
  board_id: 'board1',
};

const newMember: any = {
  _id: 'newTaskMemberId',
  task_id: taskId,
  member_id: memberId,
};

describe('Task Member Management API', function () {
  this.timeout(7000);
  let findStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Post /task-member/add-member', () => {
    it('should add a task member if not already added', async () => {
      sinon.stub(TaskModel, 'findOne').withArgs({ _id: taskId }).resolves(mockTask);
      sinon.stub(TaskMemberModel, 'findOne').withArgs({ task_id: taskId, member_id: memberId }).resolves(null);
      const fakeMemberId = new mongoose.Types.ObjectId().toString();
      sinon.stub(User, 'findOne').withArgs({ _id: memberId }).resolves({ _id: fakeMemberId });
      sinon.stub(TaskMemberModel, 'create').resolves(newMember);
      const emitStub = sinon.stub();
      sinon.stub(getSocket(), 'io').value({ to: () => ({ emit: emitStub }) });

      await server
        .post(`${API_URL}/task-member/add-member`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({ task_id: taskId, member_id: memberId })
        .expect(201)
        .then((res) => {
          expect(res.body.message).to.equal('Task member successfully joined');
        });
    });

    it('should return error if task already exists', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves({ _id: taskId } as any);

      sinon.stub(TaskMemberModel, 'findOne').resolves(newMember as any);
      sinon.stub(User, 'findOne').withArgs({ _id: memberId }).resolves({ _id: '1231' });

      server
        .post(`${API_URL}/task-member/add-member`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, member_id: memberId })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Member already joined this task..!');
          done();
        });
    });

    it('should return error if task not found', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves(null);
      sinon.stub(User, 'findOne').withArgs({ _id: memberId }).resolves({ _id: '123' });

      server
        .post(`${API_URL}/task-member/add-member`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, member_id: memberId })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
          done();
        });
    });
    it('should return validation error', (done) => {
      sinon.stub(TaskMemberModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/task-member/add-member`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: '', member_id: memberId })

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
        .post(`${API_URL}/task-member/add-member`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, member_id: memberId })

        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });
  });

  describe('GET /get-task-member/:taskId', () => {
    let taskLabelFindStub: sinon.SinonStub;
    it('should get task member successfully', function (done) {
      taskLabelFindStub = sinon.stub(TaskMemberModel, 'find').returns({
        populate: sinon
          .stub()
          .returnsThis()
          .resolves([
            {
              _id: '67fdf5e2f8821326933d3031',
              task_id: {
                _id: '67f8c042bba597c4d51a5a7b',
                title: 'Signup updated 12',
                description: 'hello',
                board_id: '67f78e4e22f51102298dce53',
                status_list_id: '67f78d73629136b8f23f0247',
                position: 2,
              },
              member_id: {
                profile_image: '',
                _id: '67f613a0bb8c0151aa249af7',
                first_name: 'Suraj',
                middle_name: 'C',
                last_name: 'Rathod',
                email: 'suraj.tatvasoft@gmail.com',
              },
              createdAt: '2025-04-15T06:00:02.226Z',
              updatedAt: '2025-04-15T06:00:02.226Z',
              __v: 0,
            },
            {
              _id: '6801def388d065b3687e378e',
              task_id: {
                _id: '67f8c042bba597c4d51a5a7b',
                title: 'Signup updated 12',
                description: 'hello',
                board_id: '67f78e4e22f51102298dce53',
                status_list_id: '67f78d73629136b8f23f0247',
                position: 2,
              },
              member_id: {
                profile_image: {
                  url: 'https://res.cloudinary.com/dfdfutcgp/image/upload/v1744865250/profile/vgnvurqxapmsmqdlv9ii.jpg',
                  imageId: 'profile/vgnvurqxapmsmqdlv9ii',
                  imageName: 'villa.jpg',
                },
                _id: '6800862e981efa2ffc3568eb',
                first_name: 'Keyur Test New12211',
                middle_name: 'New12',
                last_name: 'Xyz',
                email: 'testk1@yopmail.com',
              },
              createdAt: '2025-04-18T05:11:15.035Z',
              updatedAt: '2025-04-18T05:11:15.035Z',
              __v: 0,
            },
          ]),
      } as any);

      server
        .get(`${API_URL}/task-member/get-task-member/121`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.message).to.equal('Task member successfully fetched');
          done();
        });
    });

    it('should get task member 401 error', function (done) {
      const error = new Error('Database error');
      sinon.stub(TaskMemberModel, 'find').throws(error);

      server
        .get(`${API_URL}/task-member/get-task-member/121`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(401)
        .end((err, res) => {
          expect(res.body.message).to.equal('Database error');
          done();
        });
    });
  });

  describe('DELETE /delete-member/:id', () => {
    it('should delete a task member by ID', async () => {
      const taskMemberId = 'tm1';
      const fakeMemberId = new mongoose.Types.ObjectId().toString();
      sinon.stub(TaskMemberModel, 'findOne').withArgs({ _id: taskMemberId }).resolves({ _id: taskMemberId, member_id: fakeMemberId });

      const sessionStub: any = {
        startTransaction: sinon.stub(),
        commitTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      };

      sinon.stub(mongoose, 'startSession').resolves(sessionStub as any);
      sinon.stub(TaskMemberModel, 'findByIdAndDelete').withArgs({ _id: taskMemberId }, { session: sessionStub }).resolves({ _id: taskMemberId });

      await server
        .delete(`${API_URL}/task-member/delete-member/${taskMemberId}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        // .expect(200)
        .then((res) => {
          expect(res.body.message).to.equal('Task member successfully removed');
        });
    });
    it('should return 400 if task not found', (done) => {
      const findOneStub = sinon.stub(TaskMemberModel, 'findOne').resolves(null);
      const startSessionStub = sinon.stub(mongoose, 'startSession').resolves({
        startTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      } as any);

      server
        .delete(`${API_URL}/task-member/delete-member/121`)
        .set('Cookie', ['access_token=token'])
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task member not found..!');
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

      const findOneStub = sinon.stub(TaskMemberModel, 'findOne').throws(new Error(errorMessage));

      server
        .delete(`${API_URL}/task-member/delete-member/121`)
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
