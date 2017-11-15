const {Instrumentation} = require('zipkin');

module.exports = function zipkinClient(got, {tracer, serviceName = 'unknown', remoteServiceName}) {
  const instrumentation = new Instrumentation.HttpClient({tracer, serviceName, remoteServiceName});

  function zipkinGot(url, opts = {}) {
    return new Promise((resolve, reject) => {
      tracer.scoped(() => {
        const method = opts.method || 'GET';
        const zipkinOpts = instrumentation.recordRequest(opts, url, method);
        const traceId = tracer.id;

        got(url, zipkinOpts).then(res => {
          tracer.scoped(() => {
            instrumentation.recordResponse(traceId, res.statusCode);
          });
          resolve(res);
        }).catch(err => {
          tracer.scoped(() => {
            instrumentation.recordError(traceId, err);
          });
          reject(err);
        });
      });
    });
  }

  zipkinGot.stream = function zipkinGotStream(url, opts = {}) {
    let traceId;
    let zipkinOpts;
    tracer.scoped(() => {
      const method = opts.method || 'GET';
      zipkinOpts = instrumentation.recordRequest(opts, url, method);
      traceId = tracer.id;
    });

    const stream = got.stream(url, zipkinOpts);
    stream.on('response', (res) => {
      tracer.scoped(() => {
        instrumentation.recordResponse(traceId, res.statusCode);
      });
    });
    stream.on('error', (err) => {
      tracer.scoped(() => {
        instrumentation.recordError(traceId, err);
      });
    });

    return stream;
  };

  const methods = [
    'get',
    'post',
    'put',
    'patch',
    'head',
    'delete'
  ];

  for (const method of methods) {
    zipkinGot[method] = (url, opts) => zipkinGot(url, Object.assign({}, opts, {method}));
    zipkinGot.stream[method] = (url, opts) =>
      zipkinGot.stream(url, Object.assign({}, opts, {method}));
  }

  return zipkinGot;
};
