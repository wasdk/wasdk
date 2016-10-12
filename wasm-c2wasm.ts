#! /usr/bin/env node

import * as fs from "fs";
let tmp = require('tmp');
let binDirectory = "./bin";
let clangPath = binDirectory + "/clang-4.0";
let llcPath = binDirectory + "/llc";
let s2wasmPath = binDirectory + "/s2wasm";
let wasmAsPath = binDirectory + "/wasm-as";
let wasmDisPath = binDirectory + "/wasm-dis";
var spawnSync = require('child_process').spawnSync;

import { ArgumentParser } from "argparse";
var REMAINDER = require('argparse/lib/const').REMAINDER;

var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'Argparse example'
});
parser.addArgument(
  ['-o', '--output'],
  {
    help: 'Output file.'
  }
);
parser.addArgument(
  ['input'],
  {
    help: 'Input file(s).',
  }
);

var args = parser.parseArgs();
let bcFile = tmp.fileSync({ postfix: ".bc" }).name;
let compilerArgs = ["--target=wasm32", "-O3"];
compilerArgs = compilerArgs.concat(args.input);
compilerArgs = compilerArgs.concat(["-c", "-emit-llvm", "-o", bcFile]);
// console.dir(compilerArgs);

let child = spawnSync(clangPath, compilerArgs);
// console.info(child.stderr.toString());

let sFile = tmp.fileSync({ postfix: ".s" }).name;
child = spawnSync(llcPath, [bcFile, "-o", sFile]);
console.info(child.stderr.toString());

// console.info(fs.readFileSync(sFile).toString());

child = spawnSync(s2wasmPath, [sFile, "-o", args.output]);
// console.info(child.stderr.toString());


// var ArgumentParser = require('../lib/argparse').ArgumentParser;