const sinon = require('sinon');
const express = require('express');
const got = require('got');
const {Tracer, ExplicitContext, BatchRecorder} = require('zipkin');
const {expect} = require('chai');
const zipkinClient = require('../src/zipkinClient');

function expectCorrectSpanData(span, path) {
  expect(span.remoteEndpoint.serviceName).to.equal('test');
  expect(span.tags['http.url']).to.equal(path);
  expect(span.tags['http.status_code']).to.equal('202');
}

describe('got interceptor', () => {
  before(function(done) {
    const app = express();
    app.post('/user', (req, res) => res.status(202).json({
      traceId: req.header('X-B3-TraceId') || '?',
      spanId: req.header('X-B3-SpanId') || '?'
    }));
    app.get('/user', (req, res) => res.status(202).json({}));
    this.server = app.listen(0, () => {
      this.port = this.server.address().port;
      done();
    });
  });

  after(function(done) {
    this.server.close(done);
  });

  it('should instrument "got"', function(done) {
    const logSpan = sinon.spy();

    const ctxImpl = new ExplicitContext();
    const recorder = new BatchRecorder({logger: {logSpan}});
    const tracer = new Tracer({ctxImpl, recorder});
    tracer.setId(tracer.createRootId());

    const zipkinGot = zipkinClient(got, {tracer, remoteServiceName: 'test'});
    const path = `http://127.0.0.1:${this.port}/user`;
    zipkinGot(path).then(() => {
      zipkinGot.post(path, {json: true}).then((postRes) => {
        zipkinGot.stream(path).on('response', () => {
          const postStream = zipkinGot.stream.post(path);
          postStream.end();

          postStream.on('data', (streamPostRes) => {
            const span = logSpan.args[3][0];

            expect(span.traceId).to.equal(JSON.parse(streamPostRes.body).traceId);
            expect(span.id).to.equal(JSON.parse(streamPostRes.body).spanId);
          });

          postStream.on('response', () => {
            const spans = logSpan.args.map(arg => arg[0]);
            expect(spans).to.have.length(4);

            spans.forEach(span => expectCorrectSpanData(span, path));

            expect(spans[0].name).to.equal('get');
            expect(spans[1].name).to.equal('post');
            expect(spans[2].name).to.equal('get');
            expect(spans[3].name).to.equal('post');

            expect(spans[1].traceId).to.equal(postRes.body.traceId);
            expect(spans[1].id).to.equal(postRes.body.spanId);

            done();
          });
        });
      }).catch(done);
    }).catch(done);
  });

  it('should record errors', function(done) {
    const logSpan = sinon.spy();

    const ctxImpl = new ExplicitContext();
    const recorder = new BatchRecorder({logger: {logSpan}});
    const tracer = new Tracer({ctxImpl, recorder});
    tracer.setId(tracer.createRootId());

    const zipkinGot = zipkinClient(got, {tracer});
    const path = `http://127.0.0.1:${this.port}/missing`;
    zipkinGot(path).catch((err) => {
      zipkinGot.stream(path).on('error', (streamErr) => {
        const spans = logSpan.args.map(arg => arg[0]);
        expect(spans).to.have.length(2);

        expect(spans[0].tags.error).to.equal(err.toString());
        expect(spans[1].tags.error).to.equal(streamErr.toString());

        done();
      });
    });
  });
});
