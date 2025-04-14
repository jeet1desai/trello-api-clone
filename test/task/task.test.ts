import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { BoardModel } from '../../src/model/board.model';
import { StatusModel } from '../../src/model/status.model';
import { TaskModel } from '../../src/model/task.model';

const mockUser = {
  _id: new mongoose.Types.ObjectId().toString(),
  email: 'creator@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

const taskMock = {
  _id: 'mockedTaskId123',
  title: 'New Task2',
  board_id: 'xyz',
  status_list_id: 'abc',
  created_by: 'user123',
  position: 1,
};

describe('Task Management API', function () {
  let findOneStub: sinon.SinonStub;
  let createStub: sinon.SinonStub;
  let findStub: sinon.SinonStub;
  let deleteStub: sinon.SinonStub;
  let findByIdAndDeleteStub: sinon.SinonStub;
  this.timeout(7000);

  beforeEach(() => {
    sinon.stub(jwt, 'verify').returns(mockUser as any);
    sinon.stub(User, 'findById').resolves(mockUser as any);
  });

  afterEach(() => {
    sinon.restore();
  });
  describe('POST /task/create-task', () => {
    it('should create task successfully', (done) => {
      const findOneStub = sinon.stub(TaskModel, 'findOne');
      const createStub = sinon.stub(TaskModel, 'create');

      // 1st call: check if task exists
      findOneStub.withArgs({ title: 'New Task2', board_id: 'xyz', status_list_id: 'abc' }).resolves(null);

      // 2nd call: get last task (needs to support sort().exec())
      findOneStub.withArgs({ board_id: 'xyz', status_list_id: 'abc' }).returns({
        sort: () => ({
          exec: () => Promise.resolve(null), // or return a mock task object
        }),
      } as any);

      createStub.resolves(taskMock as any);

      server
        .post(`${API_URL}/task/create-task`)
        .set('Cookie', ['access_token=token'])
        .send({
          title: 'New Task2',
          board_id: 'xyz',
          status_list_id: 'abc',
        })
        .expect(201)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Task successfully created');
          done();
        });
    });

    it('should return error if task already exists', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves(taskMock as any);

      server
        .post(`${API_URL}/task/create-task`)
        .set('Cookie', ['access_token=token'])
        .send({
          title: 'Existing Task1',
          board_id: 'xyz',
          status_list_id: 'abc',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task already exists..!');
          done();
        });
    });

    it('should return 502 on DB error', (done) => {
      sinon.stub(TaskModel, 'findOne').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/task/create-task`)
        .set('Cookie', ['access_token=token'])
        .send({
          title: 'Failing Task',
          board_id: 'xyz',
          status_list_id: 'abc',
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
        .post(`${API_URL}/task/create-task`)
        .set('Cookie', ['access_token=token'])
        .send({
          title: 'New Task2',
          status_list_id: 'abc',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Board id is required');
          done();
        });
    });
  });

  describe('Update /task/get-task', () => {
    it('should update a task successfully', (done) => {
      const taskId = 'task123';
      const body = {
        taskId,
        title: 'Updated Task Title',
        description: 'Updated Description',
        status: 'in-progress',
      };

      const mockTask = {
        _id: taskId,
        title: 'Old Title',
        description: 'Old Description',
        status: 'todo',
        position: 1,
        status_list_id: 'status1',
        save: sinon.stub().resolves(),
      };

      sinon
        .stub(TaskModel, 'findById')
        .withArgs(taskId)
        .resolves(mockTask as any);

      server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send(body)
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Task updated successfully');
          expect(mockTask.save.calledOnce).to.be.true;
          done();
        });
    });
    it('should return 404 if task is not found', (done) => {
      const taskId = 'nonexistent-task';

      sinon.stub(TaskModel, 'findById').withArgs(taskId).resolves(null);

      server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({ taskId })
        .expect(404)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found');
          done();
        });
    });
    it('should return 400 if taskId is missing', (done) => {
      server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({})
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('taskId is required');
          done();
        });
    });
    it('should return 500 if TaskModel.findById throws', (done) => {
      const taskId = 'task123';
      sinon.stub(TaskModel, 'findById').throws(new Error('DB Failure'));

      server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({ taskId })
        .expect(500)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB Failure');
          done();
        });
    });
    it('should reorder tasks and update status_list_id when status list changes', async function () {
      const taskId = 'task1';
      const oldStatusListId = 'status1';
      const newStatusListId = 'status2';

      const movingTask = {
        _id: taskId,
        title: 'Task A',
        position: 2,
        status: 'todo',
        status_list_id: oldStatusListId,
        save: sinon.stub().resolves(),
      };

      const oldListTasks = [{ _id: 'task2' }, { _id: 'task3' }];

      const newListTasks = [{ _id: 'task4' }, { _id: 'task5' }];

      sinon
        .stub(TaskModel, 'findById')
        .withArgs(taskId)
        .resolves(movingTask as any);

      const findStub: any = sinon.stub(TaskModel, 'find');
      findStub.withArgs({ status_list_id: oldStatusListId, _id: { $ne: taskId } }).returns({
        sort: sinon.stub().withArgs('position').resolves(oldListTasks),
      } as any);

      findStub.withArgs({ status_list_id: newStatusListId }).returns({
        sort: sinon.stub().withArgs('position').resolves(newListTasks),
      } as any);

      const bulkWriteStub = sinon.stub(TaskModel, 'bulkWrite').resolves();

      await server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          taskId,
          status_list_id: newStatusListId,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.message).to.equal('Task updated successfully');
          expect(bulkWriteStub.calledOnce).to.be.true;
          expect(movingTask.status_list_id).to.equal(newStatusListId);
          expect(movingTask.position).to.equal(newListTasks.length + 1); // inserted at end
        });
    });
    it('should reorder task positions within same status list', async function () {
      const taskId = 'task1';
      const statusListId = 'status1';

      const movingTask = {
        _id: taskId,
        title: 'Task A',
        position: 2,
        status: 'todo',
        status_list_id: statusListId,
        save: sinon.stub().resolves(),
      };

      const sameListTasks = [{ _id: 'task2' }, { _id: 'task3' }];

      sinon
        .stub(TaskModel, 'findById')
        .withArgs(taskId)
        .resolves(movingTask as any);

      const findStub: any = sinon.stub(TaskModel, 'find');
      findStub
        .withArgs({
          status_list_id: statusListId,
          _id: { $ne: taskId },
        })
        .returns({
          sort: sinon.stub().withArgs('position').resolves(sameListTasks),
        } as any);

      const bulkWriteStub = sinon.stub(TaskModel, 'bulkWrite').resolves();

      await server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          taskId,
          newPosition: 1,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.message).to.equal('Task updated successfully');
          expect(bulkWriteStub.calledOnce).to.be.true;
          const reordered: any = bulkWriteStub.firstCall.args[0];
          expect(reordered[0].updateOne.update.position).to.equal(1);
        });
    });
  });

  describe('GET /task/get-task', () => {
    it('should fetch task list by status id', (done) => {
      findStub = sinon.stub(TaskModel, 'find').returns({
        sort: sinon.stub().returns({
          select: sinon.stub().returns({
            populate: sinon.stub().resolves([taskMock]),
          }),
        }),
      } as any);

      server
        .get(`${API_URL}/task/get-task?statusId=abc`)
        .set('Cookie', ['access_token=token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Task successfully fetched');
          expect(res.body.data).to.be.an('array');
          done();
        });
    });

    it('should fetch task details by task id', (done) => {
      findStub = sinon.stub(TaskModel, 'findById').returns({
        select: sinon.stub().returns({
          populate: sinon
            .stub()
            .withArgs({
              path: 'status_list_id',
              select: '_id name description board_id',
              populate: sinon.match.array,
            })
            .returns({
              populate: sinon
                .stub()
                .withArgs({
                  path: 'created_by',
                  select: '_id first_name \u00A0 middle_name last_name email profile_image',
                })
                .resolves(taskMock),
            }),
        }),
      } as any);

      server
        .get(`${API_URL}/task/get-task/mockedTaskId123`)
        .set('Cookie', ['access_token=token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Task details successfully fetched');
          expect(res.body.data).to.be.an('object');
          expect(res.body.data).to.have.property('_id').equal('mockedTaskId123');
          done();
        });
    });

    it('should return 502 if TaskModel.find throws an error', function (done) {
      const statusId = '67f78e4e22f51102298dce53';
      const errorMessage = 'Database error';

      sinon.stub(TaskModel, 'find').throws(new Error(errorMessage));

      server
        .get(`${API_URL}/task/get-task?statusId=${statusId}`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .expect(502)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal(errorMessage);
          done();
        });
    });
  });

  describe('DELETE /task/delete-task', () => {
    it('should delete task successfully', (done) => {
      const sessionMock = {
        startTransaction: sinon.stub(),
        commitTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      };

      sinon
        .stub(TaskModel, 'findOne')
        .withArgs({ _id: taskMock._id })
        .resolves(taskMock as any);
      deleteStub = sinon.stub(TaskModel, 'findByIdAndDelete').resolves(taskMock as any);
      sinon.stub(require('mongoose'), 'startSession').resolves(sessionMock as any);

      server
        .delete(`${API_URL}/task/delete-task/${taskMock._id}`)
        .set('Cookie', ['access_token=token'])
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Task successfully deleted');
          done();
        });
    });
    it('should return 400 if task not found', (done) => {
      const findOneStub = sinon.stub(TaskModel, 'findOne').resolves(null);
      const startSessionStub = sinon.stub(mongoose, 'startSession').resolves({
        startTransaction: sinon.stub(),
        abortTransaction: sinon.stub(),
        endSession: sinon.stub(),
      } as any);

      server
        .delete(`${API_URL}/task/delete-task/123`)
        .set('Cookie', ['access_token=token'])
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
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

      const findOneStub = sinon.stub(TaskModel, 'findOne').throws(new Error(errorMessage));

      server
        .delete(`${API_URL}/task/delete-task/123`)
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
