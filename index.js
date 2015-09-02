var path = require('path');
var util = fis.require('command-server/lib/util.js');
var spawn = require('child_process').spawn;

exports.start = function(opt, callback) {
  var script = path.join(opt.root, 'server.js');

  if (!fis.util.exists(script)) {
    script = path.join(__dirname, 'app.js');
  }

  var timeout = Math.max(opt.timeout * 1000, 5000);
  var timeoutTimer;
  var args = [
    script
  ];

  // 把 options 通过 args 传给 app 程序。
  fis.util.map(opt, function(key, value) {
    args.push('--' + key, String(value));
  });

  process.stdout.write('\n Starting fis-server .');
  var server = spawn(process.execPath, args, {
    cwd: path.dirname(script),
    detached: opt.daemon
  });

  var log = '';
  var started = false;

  var onData = function(chunk) {
    if (started) {
      return;
    }

    chunk = chunk.toString('utf8');
    log += chunk;
    process.stdout.write('.');

    if (~chunk.indexOf('Error')) {

      process.stdout.write(' fail.\n');
      try {
        process.kill(server.pid, 'SIGKILL');
      } catch (e) {}

      var match = chunk.match(/Error:?\s+([^\r\n]+)/i);
      var errMsg = 'unknown';

      if (~chunk.indexOf('EADDRINUSE')) {
        log = '';
        errMsg = 'Address already in use:' + opt.port;
      } else if (match) {
        errMsg = match[1];
      }

      log && console.log(log);
      callback(errMsg);
    } else if (~chunk.indexOf('Listening on')) {
      started = true;
      clearTimeout(timeoutTimer);

      server.stderr.removeListener('data', onData);
      server.stdout.removeListener('data', onData);

      process.stdout.write(' at port [' + opt.port + ']\n');

      setTimeout(function() {
        var address = 'http://127.0.0.1' + (opt.port == 80 ? '/' : ':' + opt.port + '/');

        fis.log.notice('Browse %s', address.yellow.bold);
        fis.log.notice('Or browse %s', ('http://' + util.hostname + (opt.port == 80 ? '/' : ':' + opt.port + '/')).yellow.bold);

        console.log();

        opt.browse ? util.open(address, function() {
          opt.daemon && process.exit();
        }) : (opt.daemon && process.exit());
      }, 200);
    }
  }

  server.stderr.on('data', onData);
  server.stdout.on('data', onData);

  server.on('error', function(err) {
    try {
      process.kill(server.pid, 'SIGINT');
      process.kill(server.pid, 'SIGKILL');
    } catch (e) {}
    fis.log.error(err);
  });

  if (opt.daemon) {
    util.pid(server.pid);
    server.unref();

    timeoutTimer = setTimeout(function() {
      process.stdout.write(' fail\n');
      if (log) console.log(log);
      fis.log.error('timeout');
    }, timeout);
  } else {
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);
  }
};
