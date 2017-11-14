# zipkin-instrumetation-got

This library will wrap the [got client](https://www.npmjs.com/package/got).

## Usage

```javascript
const {Tracer} = require('zipkin');
const got = require('got');
const zipkinClient = require('zipkin-instrumentation-got');

const tracer = new Tracer({ctxImpl, recorder}); // configure your tracer properly here

const zipkinGot = zipkinClient(tracer, got);

// Your application code here
zipkinGot('todomvc.com')
  .then(response => {
    console.log(response.body);
    //=> '<!doctype html> ...'
  })
  .catch(error => {
    console.log(error.response.body);
    //=> 'Internal server error ...'
  });

// Streams
zipkinGot.stream('todomvc.com').pipe(fs.createWriteStream('index.html'));

// For POST, PUT and PATCH methods got.stream returns a WritableStream
fs.createReadStream('index.html').pipe(zipkinGot.stream.post('todomvc.com'));
```
