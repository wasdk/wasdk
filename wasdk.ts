#! /usr/bin/env node

import * as fs from "fs-extra";
import * as path from "path";
import { ArgumentParser } from "argparse";
import { fail, writeEMConfig, flatten, createTmpDirectory, createTmpFilename, wasdkPath, pathFromRoot, downloadFileSync, decompressFileSync, deleteFileSync } from "./shared";
import { EMCC, TMP_DIR, LIB_ROOT, EMSCRIPTEN_ROOT, LLVM_ROOT, BINARYEN_ROOT, SPIDERMONKEY_ROOT, EM_CONFIG } from "./shared";
var spawnSync = require('child_process').spawnSync;
var colors = require('colors');
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'WebAssembly SDK'
});
let subparsers = parser.addSubparsers({ title: 'Commands', dest: "command" });

let installParser = subparsers.addParser('install', { addHelp: true });
parser.addArgument(['--clean'], { action: 'storeTrue', help: 'Clean SDK' });

let compileParser = subparsers.addParser('cc', { help: "Compile .c/.cpp files.", addHelp: true });
compileParser.addArgument(['-o', '--output'], { help: 'Output file.' });
compileParser.addArgument(['input'], { help: 'Input file(s).', nargs: "+" });

var cliArgs = parser.parseArgs();

if (cliArgs.clean) clean();
if (cliArgs.command === "install") install();
if (cliArgs.command === "cc") compile();

function section(name) {
  console.log(name.bold.green.underline);
}
// console.dir(cliArgs);
function install() {
  let url, filename;
  section("Installing Emscripten");
  url = "https://s3.amazonaws.com/mozilla-games/emscripten/packages/emscripten/nightly/linux/emscripten-latest.tar.gz";
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, EMSCRIPTEN_ROOT, 1);

  section("Installing LLVM");
  url = "https://s3.amazonaws.com/mozilla-games/emscripten/packages/llvm/nightly/osx_64bit/emscripten-llvm-latest.tar.gz";
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, LLVM_ROOT, 1);

  section("Installing Binaryen");
  url = "http://areweflashyet.com/wasm/binaryen-latest.tar.gz";
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, BINARYEN_ROOT, 0);

  section("Installing Spidermonkey");

  // "http://areweflashyet.com/wasm/jsshell-latest.tar.gz"
  // url = "https://archive.mozilla.org/pub/firefox/nightly/latest-mozilla-central/jsshell-mac.zip";
  url = "http://areweflashyet.com/wasm/jsshell-latest.tar.gz";
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, SPIDERMONKEY_ROOT, 0);

  section("Installing Libs")
  url = "http://areweflashyet.com/wasm/capstone.x86.min.js.tar.gz";
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, LIB_ROOT, 0);

  writeEMConfig();
}
function clean() {
  deleteFileSync(TMP_DIR);
  deleteFileSync(LLVM_ROOT);
  deleteFileSync(EMSCRIPTEN_ROOT);
}

function compile() {
  let input = cliArgs.input.map(file => path.resolve(file));
  let output = path.resolve(cliArgs.output);
  let configArgs = ["--em-config", EM_CONFIG, "-s", "BINARYEN=1"];
  let filename = createTmpFilename();
  let emccArgs = [input, "-o", path.join(TMP_DIR, filename + ".js")];
  let args = flatten([configArgs, emccArgs]);
  console.info(EMCC + " " + args.join(" "));
  let res = spawnSync(EMCC, args, { stdio: [0, 1, 2] });
  if (res.status !== 0) fail("Compilation error.");
  let postfixes = [".asm.js", ".js", ".wasm", ".wast"];
  let outputFiles = postfixes.map(postfix => path.join(TMP_DIR, filename + postfix));
  if (!outputFiles.every(file => fs.existsSync(file))) fail("Compilation error.");
  let filedCopied = false;
  postfixes.forEach(postfix => {
    if (output.endsWith(postfix)) {
      let outputFile = path.join(TMP_DIR, filename + postfix);
      fs.copySync(outputFile, output);
      console.log(`Wrote ${output} okay.`.green);
      filedCopied = true;
      return;
    }
  });
  if (!filedCopied) fail(`Cannot write ${output} file.`.red);
}