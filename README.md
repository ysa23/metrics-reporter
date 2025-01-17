# Metrics
Metrics is a time series reporting framework for aggregators and metrics collectors such as [Graphite](https://graphiteapp.org/).

[![npm][npm-image]][npm-url]
![Lint and tests](https://github.com/ysa23/metrics-reporter/workflows/Lint%20and%20tests/badge.svg)
![Node.js Publish to NPM](https://github.com/ysa23/metrics-reporter/workflows/Node.js%20Publish%20to%20NPM/badge.svg)

## Highlights
* Time series reporting
* Plugin based: Support different aggregators with pluggable reporters
* Built in [reporters](#Reporters):
  * [Graphite (statsd)](#Graphite)
  * [DataDog](#DataDog)
  * [String](#String)
  * [Console](#Console)
  * [InMemory (for testing)](#InMemory)
* Simple, easy to use API
* Focused on performance for high throughput applications and services

## Table of Contents
* [Getting Started](#getting-started)
    * [Installations](#installation)
    * [Configuration](#configuration)
    * [Reporting metrics](#reporting-metrics)
        * [Execution time](#execution-time)
        * [Value](#value)
        * [Increment](#increment)
        * [Tagging support](#tagging-support)
     * [Reporters](#reporters)
        * [Graphite](#Graphite)
        * [DataDog](#DataDog)
        * [String](#String)
        * [Console](#Console)
        * [InMemory](#InMemory)
    * [Building new reporters](#building-new-reporters)
* [Development](#development)
    * [How to contribute](#how-to-contribute)
    * [Running tests](#running-tests)

## Getting started
### Installation
[![npm (scoped)](https://img.shields.io/npm/v/metrics-reporter.svg)](https://www.npmjs.com/package/metrics-reporter)

### Configuration
Import metrics package:
```js
const { Metrics } = require('metrics-reporter');
```
Initialize the metrics instance with the required reporters:
```js
const { StringReporter, ConsoleReporter } = require('metrics-reporter');

const stringReporter = new StringReporter({ action: metricString => {
        // Do something
    }});
const consoleReporter = new ConsoleReporter();

const reporters = [stringReporter, consoleReporter];// Array of reporters to trigger when a metrics should be reported
const errback = (err) => { console.error(err);};    // Optional - A function to be called when an error occurs
const tags = { tag1: 'value1' };                    // Optional - key-value pairs to be appanded to all the metrics reported

const metrics = new Metrics({ 
  reporters,
  tags,
  errback 
});
```

### Reporting Metrics
Use the `space` method on the `Metrics` instance to report custom metrics. `space` creates a new key to report:
```js
const metric = metrics.space('http');
```
Spaces can be nested:
```js
const metric = metrics.space('http').space('requests'); // http.requests
```

#### Execution time
Use the `meter` method on a `Space` to report execution time of a function:
```javascript
// Callback function
const wrapper = metrics.space('users.get').meter(function(userIds, callback) {
	// read users from database
	callback(...);
});

wrapper([1, 2, 3], (err, result) => { console.log(result); });
```
The `meter` method can receive:
* A function with a callback (as the last parameter)
* Promise
* Async function

`meter` returns a **wrapper** around the object that was sent.
In order to start measuring **invoke** it according to its type. For example:
```javascript
// Sync invocation
const wrapperSync = metrics.space('add').meter((a, b) => a + b);
const result = wrapperSync(1, 2);

// Promise invocation
const wrapperPromise = metrics.space('timeout').meter(new Promise(function(resolve) {
  setTimeout(() => console.log('hello'), 10000);
}));
await wrapperPromise();
```

The meter function will run your code, while measuring the time it took to execute, and report it to the configured reporters.

Note:
* In a callback: Metrics are reported only **after** the callback is called
* In a promise and async function: Metrics are reported once the promise fulfills (either success or failure)

If an async function is measured, you can await on it and get its returned value:
```js
const result = await metrics.space('users.get').meter(async () => {
    // Some async code here
})();
```
**Please note the invocation on the return value.**

#### Value
Use the `Metrics` instance to report a value:
```js
metrics.space('api.response.size').value(512);
```

#### Increment
Use the `Metrics` instance to increment a key:
```js
metrics.space('api.requests').increment();
```

#### Tagging support
Tags are specified per space, as an object:
```js
metrics.space('http.requests', { path: 'users_get' }).increment();
```
When nesting spaces, the tags are aggregated:
```js
metrics
    .space('http', { verb: 'GET' })
    .space('requests', { path: 'users' })
    .increment(); 
    // will increment 'http.requests' with 'verb:GET,path:users' tags
```
##### Note
When the same tag is specified when creating nested spaces, the last value will be reported

#### Error handling
Metrics support error handling. When creating a Metric object you can send an error callback:
```js
const metrics = new Metrics({ 
  reporters: [new ConsoleReporter()],
  errback: e => {
    // e is a javascript Error object. You can log it on any standard logging framework:
    logger.error(e);
  }
});
```
The error callback receives a single parameter - an Error instance. The callback will be triggered when any error occurs during the metrics reporting.

**Please note:** Some reporters require their own error handler. Make sure to initialize `errback` with them as well.  

### Reporters
Metrics comes with several built-in reporters
#### Graphite
Reports metrics to a graphite server (via statsd):
```js
const { Metrics, GraphiteReporter } = require('metrics-reporter');

const graphiteHost = '1.1.1.1';         // Graphite server IP address
const graphitePort = 8125;              // Optional - port number. Defaults to 8125
const spacePrefix = 'My.Project';       // Optional - prefix to all metrics spaces
const batch = true;                     // Optional - Default `true` - Indicates that metrics will be sent in batches
const maxBufferSize = 500;              // Optional - Default `1000` - Size of the buffer for sending batched messages. When buffer is filled it is flushed immediately
const flushInterval = 1000;             // Optional - Default `1000` (1s) - Time in milliseconds. Indicates how often the buffer is flushed in case batch = true
const errback = (err) => {              // Optional - function to be triggered when an error occurs 
    console.error(err) 
};

const graphiteReporter = new GraphiteReporter({
  host: graphiteHost,
  port: graphitePort,
  prefix: spacePrefix,
  batch,
  maxBufferSize,
  flushInterval,
  errback,
});

const metrics = new Metrics({ reporters: [graphiteReporter] });

graphiteReporter.close(); // close should be called when the application terminates
```

#### DataDog
Reports metrics to a [DataDog](https://www.datadoghq.com/) (via [DogStatsD](https://docs.datadoghq.com/developers/dogstatsd/?tab=hostagent)):
```js
const { Metrics, DataDogReporter } = require('metrics-reporter');

const agentHost = '1.1.1.1';            // DataDog agent IP address
const port = 8125;                      // Optional - Default `8125` - port number. Defaults to 8125
const spacePrefix = 'My.Project';       // Optional - prefix to all metrics spaces
const batch = true;                     // Optional - Default `true` - Indicates that metrics will be sent in batches
const maxBufferSize = 500;              // Optional - Default `1000` - Size of the buffer for sending batched messages. When buffer is filled it is flushed immediately
const flushInterval = 1000;             // Optional - Default `1000` (1s) - Time in milliseconds. Indicates how often the buffer is flushed in case batch = true
const errback = (err) => {              // Optional - function to be triggered when an error occurs 
  console.error(err)
};

const datadogReporter = new DataDogReporter({
  host: agentHost,
  port,
  prefix: spacePrefix,
  batch,
  maxBufferSize,
  flushInterval,
  errback,
});

const metrics = new Metrics({ reporters: [datadogReporter] });

datadogReporter.close(); // close should be called when the application terminates
```
Note that you'll need a running [DataDog agent](https://docs.datadoghq.com/agent/). In the `/docker` folder there's a simple docker compose for datadog to get you started

#### Console
Console reporter comes in handy when you need to debug metrics calls:
```js
const { Metrics, ConsoleReporter } = require('metrics-reporter');

const consoleReporter = new ConsoleReporter();
	
const metrics = new Metrics({ reporters: [consoleReporter] });
```
When a metrics will be reported, a message will appear in the terminal, that includes the key and the value reported.

#### String
```js
const { Metrics, StringReporter } = require('metrics-reporter');
const fs = require('fs');

const stringReporter = new StringReporter({
    action: metricString => {
        fs.appendFile('metrics.log', metricsString);
    },
});
	
const metrics = new Metrics({ reporters: [stringReporter] });
```
Here, `StringReporter` is used to build a log file from the metrics reports.

#### InMemory
InMemoryReporter can be used for testing purposed, in order to make sure your code reports metrics as expected.
```js
const { Metrics, InMemoryReporter } = require('metrics-reporter');

const metricsStorage = [];

const memoryReporter = new InMemoryReporter({ buffer: metricsStorage });

const metrics = new Metrics({ reporters: [memoryReporter], errback: error => { /* Do something on error */ } });
```
When a metric is reported, an object with `key`, `value` and `tags` properties is pushed to the array.<br/>
Then, the array can be used in order to validate the report.

### Building new reporters
Metrics support creating new reports according to an application needs.

A reporter must contain three methods:
* `report` - for reporting time
* `value` - for reporting a single value (size of response for example)
* `increment` - for an incremented value over time (number of requests for example

The methods get the following parameters:
 * `key` (mandatory) - the metric to report
 * `value` (mandatory) - the value to report (ms, count or increment for example)
 * `tags` (optional) - an object that contains the tags to report on the metric as properties

For example, lets see how to implement a reporter for redis:
```js
const client = require('redis').createClient();

function RedisReporter({
    channel, 
    errback
}) {
  function report(key, val, tags) { 
    client.publish(channel, JSON.stringify({ key, value: val, tags  }));
  }

  function value(key, val, tags) {
    client.set(key, val, (err) => {
        if (!err || !errback) {
            return;
        }
        
        errback(err);
    });
  }
 
  function increment(key, value, tags) {
    const multi = client.multi();
    for(let i = 0; i < value; i++) {
        multi.incr(key);
    }   
        
    multi.exec((err) => {
      if (!err || !errback) {
        return;
      }

      errback(err);
    });
  }
  
  return {
    report,
    value,
    increment,
  }
};

module.exports = {
  RedisReporter,
};
```
The new reporter will publish a message to a specified channel in redis when a metric is reported.

## Development

### How to contribute
We encourage contribution via pull requests on any feature you see fit.

When submitting a pull request make sure to do the following:
* Run all unit and integration tests to ensure no existing functionality has been affected
* Write unit or integration tests to test your changes. All features and fixed bugs must have tests to verify they work

Read [GitHub Help](https://help.github.com/articles/about-pull-requests/) for more details about creating pull requests

### Running tests
To run tests, in command line run `npm test`

[npm-image]: https://img.shields.io/npm/v/metrics-reporter.svg?style=rounded-square
[npm-url]: https://npmjs.org/package/metrics-reporter
