// let fs = require("fs");
// let log = require("log");

import * as fs from "fs";


let log = require('npmlog');
var request = require('request');
var progress = require('request-progress');
var ProgressBar = require('progress');
var Gauge = require("gauge");
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var tmp = require('tmp');
var Promise = require('es6-promise');
var decompress = require('decompress');
var spawn = require('child_process').spawnSync;
var logSymbols = require('log-symbols');

let baseUrl = "http://people.mozilla.org/~ydelendik/tmp/llvm-binaryen-mac.tar.gz";
// let baseUrl = "http://google.com/doodle.png";
let binDirectory = "./bin";
let clangPath = binDirectory + "/clang-4.0";
let llcPath = binDirectory + "/llc";
let s2wasmPath = binDirectory + "/s2wasm";
let wasmAsPath = binDirectory + "/wasm-as";
let wasmDisPath = binDirectory + "/wasm-dis";

var gauge = new Gauge();

declare var Math: any;
function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};

function downloadFile(url: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    log.info(`Downloading ${url} ${path}`);
    progress(request(url), {
      throttle: 100,
      delay: 1000
    })
      .on('progress', function (state) {
        gauge.show(`Downloading Tools`, state.percentage);
      })
      .on('error', function (err) {
        gauge.hide();
        reject();
      })
      .on('end', function () {
        gauge.hide();
        resolve(path);
      })
      .pipe(fs.createWriteStream(path));
  });
}

function fail(reason: string) {
  log.error(reason);
  process.exit(1);
}

function check() {
  let cppFile = tmp.fileSync({ postfix: ".cpp" }).name;
  let bcFile = tmp.fileSync({ postfix: ".bc" }).name;
  let sFile = tmp.fileSync({ postfix: ".s" }).name;
  let wastFile = tmp.fileSync({ postfix: ".wast" }).name;
  let wasmFile = tmp.fileSync({ postfix: ".wasm" }).name;
  var child = spawn(clangPath, ['--version']);
  // Check clang
  if (child.stdout.indexOf("clang version 4.0.0") < 0) {
    fail("Cannot validate clang executable.");
  }
  fs.writeFileSync(cppFile, "int main() { return 42; }", 'utf8');
  child = spawn(clangPath, ["--target=wasm32", "-O0", cppFile, "-c", "-emit-llvm", "-o", bcFile]);
  if (child.status != 0) {
    fail(child.stderr);
  } else {
    log.info("clang " + logSymbols.success);
  }

  // Check llc
  child = spawn(llcPath, ['--version']);
  if (child.stdout.indexOf("LLVM version 4.0.0") < 0) {
    fail("Cannot validate llc executable.");
  } else {
    log.info("llc " + logSymbols.success);
  }
  child = spawn(llcPath, ["-o", sFile, bcFile]);
  if (child.status != 0) {
    fail(child.stderr);
  }
  let sFileData = fs.readFileSync(sFile);
  if (sFileData.indexOf("main:") < 0) {
    fail("Something went wrong when compiling to .s file.");
  } else {
    log.info("llc " + logSymbols.success);
  }

  // Check s2wasm
  child = spawn(s2wasmPath, [sFile, "-o", wastFile]);
  if (child.status != 0) {
    fail(child.stderr);
  }
  let wastFileData = fs.readFileSync(wastFile);
  if (wastFileData.indexOf("(module") < 0) {
    fail("Something went wrong when compiling to .wast file.");
  } else {
    log.info("s2wasm " + logSymbols.success);
  }

  // Check wasm-as
  child = spawn(wasmAsPath, [wastFile, "-o", wasmFile]);
  if (child.status != 0) {
    fail(child.stderr);
  }
  if (!fs.existsSync(wasmFile)) {
    fail("Something went wrong when compiling to .wasm file.");
  } else {
    log.info("wasm-as " + logSymbols.success);
  }

  // Check s2wasm
  log.info("All appears to be working.");
}

function downloadFilesAndCheck() {
  downloadFile(baseUrl, tmp.fileSync({ postfix: ".tar.gz" }).name).then((path) => {
    gauge.show(`Unpacking Tools`);
    decompress(path, binDirectory).then(function (files) {
      if (files.length == 0) {
        fail(`Cannot unpack file ${path}`);
      } else {
        check();
      }
      gauge.hide();
    }, function (err) {
      log.error('unzip', 'Cannot unpack file: %s', err);
      return;
    });
  });
}

let clean = false;

if (clean) {
  rimraf.sync(binDirectory);
}

if (fs.existsSync(clangPath) && fs.existsSync(llcPath)) {
  check();
} else {
  mkdirp(binDirectory, function () {
    downloadFilesAndCheck();
  });
}