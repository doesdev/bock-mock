> This is simply pino wrapped to match the (bock)[https://npmjs.org/package/bock] API

## install

```sh
$ npm install --save bock-mock
```

## usage

```js
const options = { appName: 'myAwesomeApp', logLevel: 'warn', toFile: true }
const bock = require('bock-mock')(options)
bock.fatal(new Error('something went wrong'))
```

## api

Bock exports a primary function which returns an instance with methods
(`debug`, `info`, `warn`, `fatal`, `setLogLevel`, `close`)
- **options** *(Object - optional)*
  - **appName** *(String - optional - default: 'bock')* Base name to use for log files (`${appName}-${month}-${day}-${year}.json`)
  - **logBase** *(String - optional - default: `__dirname + '/logs'`)* Path for log files
  - **logLevel** *(String - optional - default: 'debug')* Threshold for logging (i.e. if warn it won't log debug or info errors)
  - **toConsole** *(Boolean - optional - default: true)* Should log to console
  - **toFile** *(Boolean - optional - default: true)* Should log to file
  - **whitelist** *(Array - optional)* List of ignored error types / messages

Each of the four methods (`debug`, `info`, `warn`, `fatal`) accept an `Error`
object, a string, or a function that returns one of those two things. They also
accept a second argument (`transform`) which is a function that will accept as
its only argument the final text output to file and/or console, and what it
returns will the text value to be logged. There are performance implications to using the `transform` function so it's advised to limit it's use.

Where `const logger = bock([opts])` (i.e. on an instance) the following methods
are also available

`logger.setLogLevel(string logLevel)` Changes logLevel setting on instance

`logger.close()` Close forked process used for file writing

Additionally, you can choose to use the `bock.cached([opts])` which will return
the last instance instantiated using the `cached` method or create a new one
with the passed opts (and cache it).

## license

MIT © [Andrew Carpenter](https://github.com/doesdev)
