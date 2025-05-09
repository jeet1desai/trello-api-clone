import { API_URL, server } from '../setup';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import User from '../../src/model/user.model';
import mongoose from 'mongoose';
import { StatusModel } from '../../src/model/status.model';
import { TaskModel } from '../../src/model/task.model';
import * as fileHelper from '../../src/helper/saveMultipleFiles';
import * as fileUpload from '../../src/utils/cloudinaryFileUpload';
import { TaskMemberModel } from '../../src/model/taskMember.model';
import { MemberModel } from '../../src/model/members.model';

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

const uploadMock = [
  {
    imageId: 'img1',
    url: 'https://cdn.example.com/task/img1.png',
    imageName: 'img1.png',
  },
];

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
      const memberFindStub = sinon.stub(MemberModel, 'find');

      const boardId = new mongoose.Types.ObjectId().toString();
      const statusListId = 'abc';
      const title = 'New Task2';

      findOneStub.withArgs({ title, board_id: boardId, status_list_id: statusListId }).resolves(null);

      findOneStub.withArgs({ board_id: boardId, status_list_id: statusListId }).returns({
        sort: () => ({
          exec: () => Promise.resolve(null),
        }),
      } as any);

      createStub.resolves(taskMock as any);

      memberFindStub.returns({
        select: () => Promise.resolve([{ memberId: new mongoose.Types.ObjectId() }, { memberId: new mongoose.Types.ObjectId() }]),
      } as any);

      server
        .post(`${API_URL}/task/create-task`)
        .set('Cookie', ['access_token=token'])
        .send({
          title,
          board_id: boardId,
          status_list_id: statusListId,
        })
        .expect(201)
        .end((err, res) => {
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

  describe('Update /task/updated-task', () => {
    afterEach(() => {
      sinon.restore();
    });
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
      const newStatusListId = 'status21';
      const newPosition = 2;

      const movingTask = {
        _id: taskId,
        title: 'Task A',
        position: 2,
        status: 'todo',
        status_list_id: oldStatusListId,
        save: sinon.stub().resolves(),
      };

      const oldListTasks = [{ _id: 'task2' }, { _id: 'task3' }];

      const newListTasks = [
        { _id: 'task4', position: 1 },
        { _id: 'task5', position: 2 },
      ];

      const findStub: any = sinon.stub(TaskModel, 'find');

      findStub
        .withArgs({
          status_list_id: oldStatusListId,
          _id: { $ne: taskId },
        })
        .returns({
          sort: sinon.stub().withArgs('position').resolves(oldListTasks),
        } as any);

      findStub
        .withArgs({
          status_list_id: newStatusListId,
          _id: { $ne: taskId },
        })
        .returns({
          sort: sinon.stub().withArgs('position').resolves(newListTasks),
        } as any);

      sinon.stub(TaskModel, 'bulkWrite').resolves();
      sinon
        .stub(TaskModel, 'findById')
        .withArgs(taskId)
        .resolves({
          ...movingTask,
          position: newPosition,
        });

      await server
        .put(`${API_URL}/task/update-task`)
        .set('Cookie', ['access_token=fake-jwt-token'])
        .send({
          taskId,
          status_list_id: newStatusListId,
          newPosition: 2,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.message).to.equal('Task updated successfully');
          expect(movingTask.position).to.equal(newPosition);
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

  describe('POST /task/attachment', () => {
    let findOneStub: sinon.SinonStub;
    let findByIdAndUpdateStub: sinon.SinonStub;
    let saveMultipleFilesStub: sinon.SinonStub;

    afterEach(() => {
      sinon.restore();
    });
    it('should upload attachments successfully', (done) => {
      findOneStub = sinon.stub(TaskModel, 'findOne').resolves(taskMock as any);
      findByIdAndUpdateStub = sinon.stub(TaskModel, 'findByIdAndUpdate').resolves({
        ...taskMock,
        attachment: uploadMock,
      });
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: 'member id' }]);

      saveMultipleFilesStub = sinon.stub(fileHelper, 'saveMultipleFilesToCloud').resolves(uploadMock);

      server
        .post(`${API_URL}/task/attachment`)
        .set('Cookie', ['access_token=token'])
        .field('task_id', 'task123')
        .attach('attachment', Buffer.from('file content'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Attachment successfully uploaded');
          expect(findOneStub.calledOnce).to.be.true;
          done();
        });
    });
    it('should return 400 if no files are uploaded', (done) => {
      server
        .post(`${API_URL}/task/attachment`)
        .set('Cookie', ['access_token=token'])
        .field('task_id', 'task123')
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('No files uploaded');
          done();
        });
    });

    it('should return 400 if task not found', (done) => {
      findOneStub = sinon.stub(TaskModel, 'findOne').resolves(null);

      server
        .post(`${API_URL}/task/attachment`)
        .set('Cookie', ['access_token=token'])
        .field('task_id', 'invalid_task')
        .attach('attachment', Buffer.from('file content'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
          done();
        });
    });

    it('should return 500 if upload throws error', (done) => {
      findOneStub = sinon.stub(TaskModel, 'findOne').resolves(taskMock as any);
      saveMultipleFilesStub = sinon.stub(fileHelper, 'saveMultipleFilesToCloud').throws(new Error('Upload failed'));
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: 'member id' }]);

      server
        .post(`${API_URL}/task/attachment`)
        .set('Cookie', ['access_token=token'])
        .field('task_id', 'task123')
        .attach('attachment', Buffer.from('file content'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(500)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Upload failed');
          done();
        });
    });

    it('should return validation error', (done) => {
      sinon.stub(TaskModel, 'create').rejects(new Error('DB error'));

      server
        .post(`${API_URL}/task/attachment`)
        .set('Cookie', ['access_token=token'])
        .attach('attachment', Buffer.from('file content'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task id is required');
          done();
        });
    });
  });

  describe('GET /task/get-attachment', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('should return attachments successfully', (done) => {
      const mockTask = {
        _id: 'abc123',
        attachment: [{ imageId: 'img1', url: 'http://cdn.com/img1.jpg', imageName: 'file1.jpg' }],
      };

      sinon.stub(TaskModel, 'findOne').resolves(mockTask as any);

      server
        .get(`${API_URL}/task/get-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'abc123' })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Attachments fetched successfully');
          expect(res.body.data).to.deep.equal(mockTask.attachment);
          done();
        });
    });

    it('should return 400 if task not found', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves(null);

      server
        .get(`${API_URL}/task/get-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'nonexistent' })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
          done();
        });
    });

    it('should return 400 for invalid task ID', (done) => {
      const castError = new mongoose.Error.CastError('ObjectId', 'invalid-id', '_id');

      sinon.stub(TaskModel, 'findOne').throws(castError);

      server
        .get(`${API_URL}/task/get-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'invalid-id' })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Invalid task ID');
          done();
        });
    });

    it('should handle unexpected server error', (done) => {
      sinon.stub(TaskModel, 'findOne').throws(new Error('DB down'));

      server
        .get(`${API_URL}/task/get-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'abc123' })
        .expect(500)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB down');
          done();
        });
    });
  });

  describe('DELETE /task/delete-attachment', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('should return 400 if task not found', (done) => {
      sinon.stub(TaskModel, 'findOne').resolves(null);
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: 'member id' }]);

      server
        .delete(`${API_URL}/task/delete-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'abc123', imageId: 'img1' })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Task not found..!');
          done();
        });
    });

    it('should return 400 if image not found in task', (done) => {
      const mockTask = {
        _id: 'abc123',
        attachment: [],
      };

      sinon.stub(TaskModel, 'findOne').resolves(mockTask as any);
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: 'member id' }]);

      server
        .delete(`${API_URL}/task/delete-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'abc123', imageId: 'img1' })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Image not found..!');
          done();
        });
    });

    it('should delete the attachment successfully', (done) => {
      const mockTask = {
        _id: 'abc123',
        attachment: [
          { _id: 'img1', imageId: 'cloud123' },
          { _id: 'img2', imageId: 'cloud456' },
        ],
      };

      sinon.stub(TaskModel, 'findOne').resolves(mockTask as any);
      sinon.stub(TaskModel, 'findByIdAndUpdate').resolves({} as any);
      sinon.stub(fileUpload, 'deleteFromCloudinary').resolves({ result: 'ok' } as any);
      sinon.stub(TaskMemberModel, 'find').resolves([{ member_id: 'member id' }]);

      server
        .delete(`${API_URL}/task/delete-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'abc123', imageId: 'img1' })
        .expect(200)
        .end((err, res) => {
          expect(res.body.success).to.be.true;
          expect(res.body.message).to.equal('Attachment successfully deleted');
          done();
        });
    });

    it('should return 400 for invalid task ID', (done) => {
      const castError = new mongoose.Error.CastError('ObjectId', 'invalid-id', '_id');

      sinon.stub(TaskModel, 'findOne').throws(castError);

      server
        .delete(`${API_URL}/task/delete-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'invalid-id', imageId: 'img1' })
        .expect(400)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('Invalid task ID');
          done();
        });
    });

    it('should handle unexpected error', (done) => {
      sinon.stub(TaskModel, 'findOne').throws(new Error('DB crashed'));

      server
        .delete(`${API_URL}/task/delete-attachment`)
        .set('Cookie', ['access_token=token'])
        .query({ taskId: 'abc123', imageId: 'img1' })
        .expect(500)
        .end((err, res) => {
          expect(res.body.success).to.be.false;
          expect(res.body.message).to.equal('DB crashed');
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
