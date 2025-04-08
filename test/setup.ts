/// <reference types="mocha" />

import supertest from 'supertest';
import chai from 'chai';
import sinonChai from 'sinon-chai';
import app from '../src/server';

chai.use(sinonChai);
export const { expect } = chai;
export const server = supertest.agent(app);

export const BASE_URL = '/';
export const API_URL = '/v1/api';
