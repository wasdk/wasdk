/*
 * Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from "fs";
import * as http from "http";
import * as https from "https";

let log = require('npmlog');
var Gauge = require("gauge");
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var tmp = require('tmp');
var Promise = require('es6-promise');
var decompress = require('decompress');
var spawnSync = require('child_process').spawnSync;
var logSymbols = require('log-symbols');

let emsdkUrl = "https://s3.amazonaws.com/mozilla-games/emscripten/releases/emsdk-portable.tar.gz";


let baseUrl = "http://people.mozilla.org/~ydelendik/tmp/llvm-binaryen-mac.tar.gz";
let binDirectory = "./bin";
let toolsDirectory = binDirectory + "/tools";
let llvmDirectory = binDirectory + "/llvm";
let emscriptenDirectory = binDirectory + "/emscripten";

let clangPath = binDirectory + "/clang-4.0";
let llcPath = binDirectory + "/llc";
let s2wasmPath = binDirectory + "/s2wasm";
let wasmAsPath = binDirectory + "/wasm-as";
let wasmDisPath = binDirectory + "/wasm-dis";

let emsdkDirectory = binDirectory + "/emsdk_portable";

declare var Math: any;
function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};

function downloadFile(url: string, path: string, title: string): Promise<any> {
  var file = fs.createWriteStream(path);
  return new Promise((resolve, reject) => {
    let httpOrHttps: any = url.indexOf("https") === 0 ? https : http;
    var request = httpOrHttps.get(url, function (response) {
      var length = parseInt(response.headers['content-length'], 10);
      var downloaded = 0;
      // console.log(`Downloading ${title}`);
      response.on('data', function (chunk) {
        downloaded += chunk.length;
        // gauge.show(`Downloading ${title}`, downloaded / length);
      }).on('end', function (chunk) {
        file.end();
        resolve(path);
      }).pipe(file);
    }).on('error', function () {
      console.error("Failed to download " + url);
      file.end();
      reject();
    });
  });
}

function fail(reason: string) {
  console.error(reason);
  process.exit(1);
}

function check() {
  let cppFile = tmp.fileSync({ postfix: ".cpp" }).name;
  let bcFile = tmp.fileSync({ postfix: ".bc" }).name;
  let sFile = tmp.fileSync({ postfix: ".s" }).name;
  let wastFile = tmp.fileSync({ postfix: ".wast" }).name;
  let wasmFile = tmp.fileSync({ postfix: ".wasm" }).name;
  var child = spawnSync(clangPath, ['--version']);

  // Check clang
  if (child.stdout.indexOf("clang version 4.0.0") < 0) {
    fail("Cannot validate clang executable.");
  }
  fs.writeFileSync(cppFile, "int main() { return 42; }", 'utf8');
  child = spawnSync(clangPath, ["--target=wasm32", "-O0", cppFile, "-c", "-emit-llvm", "-o", bcFile]);
  if (child.status != 0) {
    fail(child.stderr);
  } else {
    console.log("clang " + logSymbols.success);
  }

  // Check llc
  child = spawnSync(llcPath, ['--version']);
  if (child.stdout.indexOf("LLVM version 4.0.0") < 0) {
    fail("Cannot validate llc executable.");
  }
  child = spawnSync(llcPath, ["-o", sFile, bcFile]);
  if (child.status != 0) {
    fail(child.stderr);
  }
  let sFileData = fs.readFileSync(sFile);
  if (sFileData.indexOf("main:") < 0) {
    fail("Something went wrong when compiling to .s file.");
  } else {
    console.log("llc " + logSymbols.success);
  }

  // Check s2wasm
  child = spawnSync(s2wasmPath, [sFile, "-o", wastFile]);
  if (child.status != 0) {
    fail(child.stderr);
  }
  let wastFileData = fs.readFileSync(wastFile);
  if (wastFileData.indexOf("(module") < 0) {
    fail("Something went wrong when compiling to .wast file.");
  } else {
    console.log("s2wasm " + logSymbols.success);
  }

  // Check wasm-as
  child = spawnSync(wasmAsPath, [wastFile, "-o", wasmFile]);
  if (child.status != 0) {
    fail(child.stderr);
  }
  if (!fs.existsSync(wasmFile)) {
    fail("Something went wrong when compiling to .wasm file.");
  } else {
    console.log("wasm-as " + logSymbols.success);
  }

  // Check s2wasm
  console.log("All appears to be working.");
}

function checkStatus(child) {
  if (child.status != 0) {
    fail(child.stderr);
  }
  console.log(logSymbols.success);
}

function installEmscripten(): Promise<any> {
  let child;
  let path = "https://s3.amazonaws.com/mozilla-games/emscripten/packages/emscripten/nightly/linux/emscripten-latest.tar.gz";
  console.log("Installing Emscripten");
  return new Promise(function (resolve, reject) {
    process.stdout.write("  Downloading ... ");
    downloadFile(path, tmp.tmpNameSync({ postfix: ".tar.gz" }), "Emscripten").then(function (path) {
      console.log(logSymbols.success);
      mkdirp(emscriptenDirectory, function () {
        process.stdout.write("  Unpacking ... ");
        child = spawnSync("tar", ["-xvzf", path, "--strip", 1, "-C", emscriptenDirectory]);
        checkStatus(child);
        resolve();
      });
    }).catch(() => {
      reject();
    });
  });
}

function installLLVM(): Promise<any> {
  let child;
  let path = "https://s3.amazonaws.com/mozilla-games/emscripten/packages/llvm/nightly/osx_64bit/emscripten-llvm-latest.tar.gz";
  console.log("Installing LLVM");
  return new Promise(function (resolve, reject) {
    process.stdout.write("  Downloading ... ");
    downloadFile(path, tmp.tmpNameSync({ postfix: ".tar.gz" }), "LLVM").then(function (path) {
      console.log(logSymbols.success);
      mkdirp(llvmDirectory, function () {
        process.stdout.write("  Unpacking ... ");
        child = spawnSync("tar", ["-xvzf", path, "--strip", 1, "-C", llvmDirectory]);
        checkStatus(child);
        resolve();
      });
    }).catch(() => {
      reject();
    });
  });
}

function installTools(): Promise<any> {
  let child;
  let path = "http://people.mozilla.org/~ydelendik/tmp/llvm-binaryen-mac.tar.gz";
  console.log("Installing Tools");
  return new Promise(function (resolve, reject) {
    process.stdout.write("  Downloading ... ");
    downloadFile(path, tmp.tmpNameSync({ postfix: ".tar.gz" }), "Tools").then(function (path) {
      console.log(logSymbols.success);
      mkdirp(toolsDirectory, function () {
        process.stdout.write("  Unpacking ... ");
        child = spawnSync("tar", ["-xvzf", path, "-C", toolsDirectory]);
        checkStatus(child);
        resolve();
      });
    }).catch(() => {
      reject();
    });
  });
}

function downloadFilesAndCheck() {
  installEmscripten().then(() => {
    installLLVM().then(() => {
      installTools().then(() => {
      });
    });
  });
  return;
}

let clean = false;

if (clean) {
  rimraf.sync(binDirectory);
}

if (fs.existsSync(clangPath) && fs.existsSync(llcPath)) {
  check();
} else {
  mkdirp(binDirectory, function () {
    // downloadFilesAndCheck();
  });
}