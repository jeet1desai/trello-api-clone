import { expect, server, BASE_URL } from './setup';

describe('Server page test', () => {
  it('gets base url', (done: any) => {
    server
      .get(`${BASE_URL}/`)
      .expect(200)
      .end((err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  });
});