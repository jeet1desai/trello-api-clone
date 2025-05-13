import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { TaskModel } from '../../src/model/task.model';
import { getSocket } from '../../src/config/socketio.config';
import { TaskLabelModel } from '../../src/model/taskLabel.model';
import { TaskMemberModel } from '../../src/model/taskMember.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

const taskId = 'task1';
const labelId = 'lable1';
const mockTask = {
  _id: taskId,
  label_id: 'Label1',
};

const newLabel: any = {
  _id: new mongoose.Types.ObjectId(),
  task_id: taskId,
  label_id: labelId,
};

const taskLabelMock = {
  _id: new mongoose.Types.ObjectId(),
  task_id: {
    _id: new mongoose.Types.ObjectId(),
    title: 'Signup updated 121',
    description: 'hello',
    board_id: new mongoose.Types.ObjectId(),
    status_list_id: new mongoose.Types.ObjectId(),
    position: 1,
  },
  label_id: {
    _id: new mongoose.Types.ObjectId(),
    name: 'QA',
    backgroundColor: '#000000',
    textColor: '#fff',
    boardId: new mongoose.Types.ObjectId(),
  },
  createdAt: '2025-04-23T08:51:53.555Z',
  updatedAt: '2025-04-23T08:51:53.555Z',
  __v: 0,
};

describe('Task Label Management API', function () {
  this.timeout(7000);
  let findStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Post /tasklabel/add', () => {
    it('should add a task member if not already added', async () => {
      sinon.stub(TaskModel, 'findOne').withArgs({ _id: taskId }).resolves(mockTask);
      sinon.stub(TaskLabelModel, 'findOne').withArgs({ task_id: taskId, label_id: labelId }).resolves(null);
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: new mongoose.Types.ObjectId() }]);
      sinon.stub(TaskLabelModel, 'create').resolves(newLabel);

      const populateStub2 = sinon.stub().resolves(taskLabelMock);
      const populateStub1 = sinon.stub().returns({ populate: populateStub2 });
      sinon.stub(TaskLabelModel, 'findById').returns({ populate: populateStub1 } as any);
      const emitStub = sinon.stub();
      sinon.stub(getSocket(), 'io').value({ to: () => ({ emit: emitStub }) });

      await server
        .post(`${API_URL}/tasklabel/add`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({ task_id: taskId, label_id: labelId })
        .expect(201)
        .then((res) => {
          expect(res.body.message).to.equal('Task label successfully added');
        });
    });

    it('should return error if task label already exists', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves({ _id: taskId } as any);

      sinon.stub(TaskLabelModel, 'findOne').resolves(newLabel as any);
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: 'member id' }]);

      server
        .post(`${API_URL}/tasklabel/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, label_id: labelId })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Label already exist in this task..!');
          done();
        });
    });

    it('should return error if task not found', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves(null);

      server
        .post(`${API_URL}/tasklabel/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, label_id: labelId })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
          done();
        });
    });
    it('should return validation error', (done) => {
      sinon.stub(TaskLabelModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/tasklabel/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: '', label_id: labelId })

        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Validation Failed');
          done();
        });
    });
    it('should return 502 on DB error', (done) => {
      sinon.stub(TaskModel, 'findOne').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/tasklabel/add`)
        .set('Cookie', ['access_token=token'])
        .send({ task_id: taskId, label_id: labelId })

        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB error');
          done();
        });
    });
  });

  describe('GET /tasklabel/get', () => {
    let taskLabelFindStub: sinon.SinonStub;
    it('should get task label successfully', function (done) {
      taskLabelFindStub = sinon.stub(TaskLabelModel, 'find').returns({
        populate: sinon
          .stub()
          .returnsThis()
          .resolves([
            {
              _id: '67fcca730754f5de40f56b9f',
              task_id: {
                _id: '67f8c042bba597c4d51a5a7b',
                title: 'Signup updated 12',
                description: 'hello',
                board_id: '67f78e4e22f51102298dce53',
                status_list_id: '67f78d73629136b8f23f0247',
                position: 2,
              },
              label_id: {
                _id: '67f8b58ca147fcdf616423ee',
                name: 'FE',
                backgroundColor: '#000000',
                textColor: '#fff',
                boardId: '67f75456d5a5094c2f31e7c1',
              },
              createdAt: '2025-04-14T08:42:27.509Z',
              updatedAt: '2025-04-14T08:42:27.509Z',
              __v: 0,
            },
          ]),
      } as any);

      server
        .get(`${API_URL}/tasklabel/get/121`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.message).to.equal('Task label successfully fetched');
          done();
        });
    });
  });

  describe('DELETE /tasklabel/delete/:id', () => {
    it('should delete a task label by ID', async () => {
      const labelId = new mongoose.Types.ObjectId();
      const taskId = new mongoose.Types.ObjectId();

      sinon
        .stub(TaskLabelModel, 'findOne')
        .withArgs({ task_id: taskLabelMock.task_id._id, label_id: taskLabelMock.label_id._id })
        .resolves({ _id: labelId, task_id: taskId });

      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: new mongoose.Types.ObjectId() }]);

      sinon.stub(TaskModel, 'findOne').withArgs({ _id: taskId }).resolves({ board_id: new mongoose.Types.ObjectId(), title: 'Task Title' });

      const sessionStub: any = {
        startTransaction: sinon.stub(),
        commitTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      };

      sinon.stub(mongoose, 'startSession').resolves(sessionStub as any);

      sinon
        .stub(TaskLabelModel, 'findOneAndDelete')
        .withArgs({ task_id: taskId, label_id: labelId }, { session: sessionStub })
        .resolves({ _id: labelId });

      await server
        .delete(`${API_URL}/tasklabel/delete?taskId=${taskId}&labelId=${labelId}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .then((res) => {
          expect(res.body.message).to.equal('Task label successfully removed');
        });
    });

    it('should return 400 if task not found', (done) => {
      const findOneStub = sinon.stub(TaskLabelModel, 'findOne').resolves(null);
      const startSessionStub = sinon.stub(mongoose, 'startSession').resolves({
        startTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      } as any);

      server
        .delete(`${API_URL}/tasklabel/delete?taskId=${taskId}&labelId=${labelId}`)
        .set('Cookie', ['access_token=token'])
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task label not found..!');
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

      const findOneStub = sinon.stub(TaskLabelModel, 'findOne').throws(new Error(errorMessage));

      server
        .delete(`${API_URL}/tasklabel/delete?taskId=${taskId}&labelId=${labelId}`)
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
