#! /usr/bin/env node

import * as fs from "fs-extra";
import * as path from "path";
import { ArgumentParser } from "argparse";
import { spawnSync, fail, pathLooksLikeDirectory, endsWith, writeEMConfig, flatten, createTmpDirectory, createTmpFilename, wasdkPath, pathFromRoot, downloadFileSync, decompressFileSync, deleteFileSync } from "./shared";
import { EMCC, WEBIDL_BINDER, TMP_DIR, LIB_ROOT, EMSCRIPTEN_ROOT, LLVM_ROOT, BINARYEN_ROOT, SPIDERMONKEY_ROOT, EM_CONFIG } from "./shared";
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
compileParser.addArgument(['--idl'], { help: 'WebIDL file.' });
compileParser.addArgument(['input'], { help: 'Input file(s).', nargs: "+" });

let smParser = subparsers.addParser('disassemble', { help: "Disassemble files.", addHelp: true });
smParser.addArgument(['input'], { help: 'Input .wast/.wasm file.' });

var cliArgs = parser.parseArgs();

if (cliArgs.clean) clean();
if (cliArgs.command === "install") install();
if (cliArgs.command === "cc") compile();
if (cliArgs.command === "disassemble") disassemble();

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
  console.dir(cliArgs);
  let inputFiles = cliArgs.input.map(file => path.resolve(file));
  let outputFile = path.resolve(cliArgs.output);
  let res, args, glueFile;
  if (cliArgs.idl) {
    let idlFile = path.resolve(cliArgs.idl);
    glueFile = path.join(TMP_DIR, createTmpFilename());
    args = [WEBIDL_BINDER, idlFile, glueFile];
    res = spawnSync("python", args, { stdio: [0, 1, 2] });
    if (res.status !== 0) fail("WebIDL binding error.");
    if (!fs.existsSync(glueFile + ".cpp") || !fs.existsSync(glueFile + ".js"))
      fail("WebIDL binding error.");
  }
  let filename = createTmpFilename();
  args = ["--em-config", EM_CONFIG, "-s", "BINARYEN=1"];
  args.push(inputFiles);
  if (glueFile) {
    args.push([glueFile + ".cpp"]);
  }
  args.push(["-o", path.join(TMP_DIR, filename + ".js")]);
  if (glueFile) {
    args.push(["--post-js", glueFile + ".js"]);
  }
  // console.info(EMCC + " " + args.join(" "));
  res = spawnSync(EMCC, flatten(args), { stdio: [0, 1, 2] });
  if (res.status !== 0) fail("Compilation error.");
  let postfixes = [".asm.js", ".js", ".wasm", ".wast"];
  let outputFiles = postfixes.map(postfix => path.join(TMP_DIR, filename + postfix));
  if (!outputFiles.every(file => fs.existsSync(file))) fail("Compilation error.");
  let filedCopied = false;
  postfixes.forEach(postfix => {
    if (endsWith(outputFile, postfix)) {
      let outputFile = path.join(TMP_DIR, filename + postfix);
      fs.copySync(outputFile, outputFile);
      console.log(`Wrote ${outputFile} okay.`.green);
      filedCopied = true;
      return;
    }
  });
  if (!filedCopied) fail(`Cannot write ${outputFile} file.`.red);

  // python ./bin/emscripten/tools/webidl_binder.py test/simple.idl glue
}

function disassemble() {
  let input = path.resolve(cliArgs.input);
  let args = flatten(["./dist/wasm-sm.js", input]);
  let res = spawnSync(path.join(SPIDERMONKEY_ROOT, "js"), args, { stdio: [0, 1, 2] });
  if (res.status !== 0) fail("Disassembly error.");
}