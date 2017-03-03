#! /usr/bin/env node
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

import * as fs from "fs-extra";
import * as path from "path";
import { ArgumentParser } from "argparse";
import { appendFilesSync, spawnSync, fail, pathLooksLikeDirectory, endsWith, writeEMConfig, flatten, createTmpFile, wasdkPath, pathFromRoot, downloadFileSync, decompressFileSync, deleteFileSync, ensureDirectoryCreatedSync } from "./shared";
import { WASDK_DEBUG, EMCC, JS, WEBIDL_BINDER, TMP_DIR, EMSCRIPTEN_ROOT, LLVM_ROOT, BINARYEN_ROOT, SPIDERMONKEY_ROOT, EM_CONFIG } from "./shared";
import { WebIDLWasmGen, WasmIDL } from "./wasm-idl/wasm-idl";
var colors = require('colors');
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'WebAssembly SDK'
});
let subparsers = parser.addSubparsers({ title: 'Commands', dest: "command" });

let sdkParser = subparsers.addParser('sdk', { addHelp: true });
sdkParser.addArgument(['--install'], { action: 'storeTrue', help: 'Install SDK' });
sdkParser.addArgument(['--test'], { action: 'storeTrue', help: 'Test SDK' });
sdkParser.addArgument(['--clean'], { action: 'storeTrue', help: 'Clean SDK' });

let ezParser = subparsers.addParser('ez', { help: "Compile .c/.cpp files.", addHelp: true });
ezParser.addArgument(['-o', '--output'], { help: 'Output file.' });
ezParser.addArgument(['--idl'], { help: 'WebIDL file.' });
ezParser.addArgument(['--debuginfo', '-g'], { action: 'storeTrue', help: 'Emit names section and debug info' });
ezParser.addArgument(['input'], { help: 'Input file(s).' });

let idlGenerator = subparsers.addParser('idl', { help: "Generate idl-based project:  .j/.c/.cpp files.", addHelp: true });
idlGenerator.addArgument(['input'], { help: 'Input .idl file.' });
idlGenerator.addArgument(['-o', '--output'], { help: 'Output directory.' });
idlGenerator.addArgument(['-n', '--namespace'], {help: 'C++ namespace'});
idlGenerator.addArgument(['-p', '--prefix'], {help: 'Filename prefix for .js/.h/.cpp'});

let smParser = subparsers.addParser('disassemble', { help: "Disassemble files.", addHelp: true });
smParser.addArgument(['input'], { help: 'Input .wast/.wasm file.' });

let emccParser = subparsers.addParser('emcc', { help: "Emscripten Compiler", addHelp: true });
emccParser.addArgument(['args'], { nargs: '...' });

let jsParser = subparsers.addParser('js', { help: "SpiderMonkey Shell", addHelp: true });
jsParser.addArgument(['args'], { nargs: '...' });

var cliArgs = parser.parseArgs();

WASDK_DEBUG && console.dir(cliArgs);

if (cliArgs.command === "emcc") emcc();
if (cliArgs.command === "js") js();
if (cliArgs.command === "sdk") sdk();
if (cliArgs.command === "idl") idl();
if (cliArgs.command === "ez") ezCompile();
if (cliArgs.command === "disassemble") disassemble();

function section(name) {
  console.log(name.bold.green.underline);
}
function js() {
  let args = cliArgs.args;
  let res = spawnSync(JS, flatten(args), { stdio: [0, 1, 2] });
}
function emcc() {
  let args = ["--em-config", EM_CONFIG].concat(cliArgs.args);
  let res = spawnSync(EMCC, flatten(args), { stdio: [0, 1, 2] });
}
function sdk() {
  if (cliArgs.clean) clean();
  if (cliArgs.install) install();
  if (cliArgs.test) test();
}
function patchEM() {
  let emscriptenPath = path.join(EMSCRIPTEN_ROOT, 'emscripten.py');

  // Fixing asm2wasm compilation, see https://github.com/kripken/emscripten/issues/4715
  let s = fs.readFileSync(emscriptenPath).toString();
  s = s.replace(/if\ssettings\[\'ALLOW_MEMORY_GROWTH\'\]:(\s+exported_implemented_functions\.)/,
    "if not settings['ONLY_MY_CODE'] and settings['ALLOW_MEMORY_GROWTH']:$1");
  fs.writeFileSync(emscriptenPath, s);
}
function install() {
  var thirdpartyConfigPath = process.env.WASDK_3PARTY ||
                             path.join(__dirname, "..", "thirdparty.json");
  let thirdpartyConfig = JSON.parse(fs.readFileSync(thirdpartyConfigPath).toString());
  let url, filename;
  let platform = process.platform;
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32")
    fail(`Platform ${process.platform} not supported.`);

  section("Installing Emscripten");
  url = thirdpartyConfig.all.emscripten;
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, EMSCRIPTEN_ROOT, 1);
  url = thirdpartyConfig.all.emscriptenpatch;
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, EMSCRIPTEN_ROOT, 0);
  patchEM();

  section("Installing LLVM");
  url = thirdpartyConfig[platform].llvm;
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, LLVM_ROOT, 1);

  section("Installing Binaryen");
  url = thirdpartyConfig[platform].binaryen;
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, BINARYEN_ROOT, 0);

  section("Installing Spidermonkey");
  url = thirdpartyConfig[platform].spidermonkey;
  filename = downloadFileSync(url, TMP_DIR);
  decompressFileSync(filename, SPIDERMONKEY_ROOT, 0);

  writeEMConfig();
}
function clean() {
  deleteFileSync(TMP_DIR);
  deleteFileSync(LLVM_ROOT);
  deleteFileSync(EMSCRIPTEN_ROOT);
}

function updateHFile(hFilePath: string, updated: string) {
  if (!fs.existsSync(hFilePath)) {
    fs.writeFileSync(hFilePath, updated);
    return;
  }
  var old = fs.readFileSync(hFilePath).toString();
  fs.writeFileSync(hFilePath + '.bak', old);
  var combined = updated;
  // getting all content between "additional members"-comment and ends of the class
  var m1, re1 = new RegExp(`\n// additional (\\w+) members([^\\n]|\\n(?!\\};))+`, "g");
  while ((m1 = re1.exec(old))) {
    var re2 = new RegExp(`\n// additional ${m1[1]} members([^\\n]|\\n(?!\\};))+`);
    // ... and placing that into new generated code in the same spot
    combined = combined.replace(re2, m1[0].split('$').join('$$'));
  }
  fs.writeFileSync(hFilePath, combined);
}
function updateCxxFile(cxxFilePath: string, updated: string) {
  if (!fs.existsSync(cxxFilePath)) {
    fs.writeFileSync(cxxFilePath, updated);
    return;
  }
  var combined = fs.readFileSync(cxxFilePath).toString();
  fs.writeFileSync(cxxFilePath + '.bak', combined);
  // replace all static typeid's
  var re1 = new RegExp(`int (\\w+)::_typeid = (\\d+);`, "g");
  combined = combined.replace(re1, (all, name, id) => {
    var m = new RegExp(`int ${name}::_typeid = (\\d+);`).exec(updated);
    return m ? m[0] : all;
  });
  // find all new blocks
  var m2, re2 = new RegExp(`\n// (\\w+) (class|callback) members([^\\n]|\\n(?!// end of};))+// end of \\1 \\2 members`, "g");
  while ((m2 = re2.exec(updated))) {
    var found = false;
    var updatedBlock = m2[0];
    var isCallback = m2[2] == 'callback';
    var re3 = new RegExp(`\n// ${m2[1]} ${m2[2]} members([^\\n]|\\n(?!// end of};))+// end of ${m2[1]} ${m2[2]} members`);
    // ... and try to update existing
    combined = combined.replace(re3, (combinedBlock: string) => {
      found = true;
      if (isCallback) {
        return updatedBlock;
      }
      // we don't interested in constructors, replacing methods bodies
      var m4, re4 = new RegExp(`(\\n(((unsigned|signed)\\s)?\\w+)\\s+${m2[1]}::(\\w+)\\(([^\\)]*)\\)\\s+\\{)(([^\\n]|\\n(?!\\}))*\\n)\\}`, "g");
      while ((m4 = re4.exec(updatedBlock))) {
        var updatedMethod = m4[0];
        var prefix = m4[1];
        var name = m4[5];
        var methodFound = false;
        // replacing method outer signature
        var re5 = new RegExp(`(\n(((unsigned|signed)\\s)?\\w+)\\s+${m2[1]}::(${name})\\(([^\\)]*)\\)\\s+\\{)(([^\\n]|\\n(?!\\}))*\\n)\\}`);
        combinedBlock = combinedBlock.replace(re5, (all, _1, _2, _3, _4, _5, _6, body) => {
          methodFound = true;
          return prefix + body + '}';
        });
        if (!methodFound) {
          // .. or add at the end
          var i = combinedBlock.lastIndexOf('\n// end of');
          combinedBlock = combinedBlock.substring(0, i) + updatedMethod + combinedBlock.substring(i);
        }
      }
      return combinedBlock;
    });
    if (!found) {
      // .. or add at the end
      var i = combined.indexOf('\n} // namespace ');
      combined = combined.substring(0, i) + updatedBlock + combined.substring(i);
     }
  }
  fs.writeFileSync(cxxFilePath, combined);
}
function idl() {
  var idlPath = cliArgs.input;
  var basename = path.basename(idlPath, path.extname(idlPath));
  var outputDir = cliArgs.output || basename;
  ensureDirectoryCreatedSync(outputDir);
  var fileprefix = cliArgs.prefix || basename;
  var namespace = cliArgs.namespace || (fileprefix[0].toUpperCase() + fileprefix.slice(1));
  if (!/^\w+$/.test(namespace)) throw new Error('Invalid C++ namespace: ' + namespace);

  var gen = new WebIDLWasmGen(namespace, fileprefix);
  var idlContent = fs.readFileSync(idlPath).toString();
  gen.parse(idlContent);
  fs.writeFileSync(path.join(outputDir, fileprefix + '.js'), gen.getJSCode());
  fs.writeFileSync(path.join(outputDir, fileprefix + '.json'), gen.getJsonCode());
  updateHFile(path.join(outputDir, fileprefix + '.h'), gen.getHCode());
  updateCxxFile(path.join(outputDir, fileprefix + '.cpp'), gen.getCxxCode());
}

interface Config {
  files: string [];
  interface?: string;
  output?: string;
  options: {
    EXPORTED_RUNTIME_METHODS: string [],
    EXPORTED_FUNCTIONS: string [],
    ONLY_MY_CODE: number,
    SIDE_MODULE: number,
    ALLOW_MEMORY_GROWTH: number,
    RELOCATABLE: number,
    VERBOSE: number
  }
}
function resolveConfig(config: Config, configPath: string = null) {
  let configRoot = null;
  if (configPath) {
    configRoot = path.resolve(path.dirname(configPath));
  }
  function resolvePath(p: string) {
    if (!p) return null;
    if (path.isAbsolute(p)) return p;
    if (configRoot) return path.resolve(path.join(configRoot, p));
    return path.resolve(p);
  }
  config.files = config.files.map(resolvePath);
  config.interface = resolvePath(config.interface);

  if (config.output) {
    config.output = resolvePath(config.output);
  }
  if (config.interface) {
    let idl = WasmIDL.parse(fs.readFileSync(config.interface).toString());
    let moduleInterface = WasmIDL.getInterfaceByName("Module", idl);
    if (!moduleInterface) fail("WebIDL file must declare a Module interface.");
    let members = moduleInterface.members.filter(m => m.type === "operation").map(m => m.name);
    config.options.EXPORTED_FUNCTIONS = config.options.EXPORTED_FUNCTIONS.concat(members.map(m => "_" + m));

    config.options.EXPORTED_FUNCTIONS.push("__growWasmMemory");
  }
}
function quoteStringArray(a: string []): string {
  return `[${a.map(x => `'${x}'`).join(", ")}]`;
}
function mergeConfigs(base: any, delta: any) {
  for (var name in delta) {
    var value = delta[name];
    if (typeof value === 'object' && value !== null) {
      if (!base[name])
        base[name] = {};
      mergeConfigs(base[name], value);
    } else {
      base[name] = value;
    }
  }
}
function ezCompile() {
  let config: Config = {
    files: [],
    interface: null,
    options: {
      EXPORTED_RUNTIME_METHODS: [],
      EXPORTED_FUNCTIONS: [],
      ONLY_MY_CODE: 1,
      ALLOW_MEMORY_GROWTH: 1,
      SIDE_MODULE: 0,
      RELOCATABLE: 1,
      VERBOSE: 0
    }
  };
  if (path.extname(cliArgs.input) === ".json") {
    mergeConfigs(config, JSON.parse(fs.readFileSync(cliArgs.input, 'utf8')));
    resolveConfig(config, cliArgs.input);
  } else {
    mergeConfigs(config, {files: [cliArgs.input]});
    resolveConfig(config);
  }

  let inputFiles = config.files.map(file => path.resolve(file));
  let res, args, glueFile;
  args = ["--em-config", EM_CONFIG, "-s", "BINARYEN=1", "-O3"];
  args.push(["-s", "NO_FILESYSTEM=1"]);
  args.push(["-s", "NO_EXIT_RUNTIME=1"]);
  args.push(["-s", "DISABLE_EXCEPTION_CATCHING=1"]);
  args.push(["-s", "BINARYEN_IMPRECISE=1"]);

  args.push(["-s", `VERBOSE=${config.options.VERBOSE}`]);
  args.push(["-s", `RELOCATABLE=${config.options.RELOCATABLE}`]);
  args.push(["-s", `ONLY_MY_CODE=${config.options.ONLY_MY_CODE}`]);
  args.push(["-s", `ALLOW_MEMORY_GROWTH=${config.options.ALLOW_MEMORY_GROWTH}`]);
  args.push(["-s", `SIDE_MODULE=${config.options.SIDE_MODULE}`]);
  args.push(["-s", `EXPORTED_RUNTIME_METHODS=${quoteStringArray(config.options.EXPORTED_RUNTIME_METHODS)}`]);
  args.push(["-s", `EXPORTED_FUNCTIONS=${quoteStringArray(config.options.EXPORTED_FUNCTIONS)}`]);

  if (cliArgs.debuginfo) args.push("-g 3");
  args.push(inputFiles);
  let outputFile = cliArgs.output ? path.resolve(cliArgs.output) : path.resolve(config.output || "a.js");
  args.push(["-o", outputFile]);
  args = flatten(args);
  console.info(EMCC + " " + args.join(" "));
  res = spawnSync(EMCC, args, { stdio: [0, 1, 2] });
  if (res.status !== 0) fail("Compilation error.");
  let postfixes = [".asm.js", ".js", ".wasm", ".wast"];
  let filename = path.join(path.dirname(outputFile), path.basename(outputFile, ".js"));
  let outputFiles = postfixes.map(postfix => filename + postfix);
  if (!outputFiles.every(file => fs.existsSync(file))) fail("Compilation error.");
}

// function ezCompile() {
//   let inputFiles = [path.resolve(cliArgs.input)];
//   let tmpInputFile = createTmpFile() + ".cpp";
//   appendFilesSync(tmpInputFile, inputFiles);

//   let res, args, glueFile;
//   if (cliArgs.idl) {
//     let idlFile = path.resolve(cliArgs.idl);
//     glueFile = createTmpFile();
//     args = [WEBIDL_BINDER, idlFile, glueFile];
//     res = spawnSync("python", args, { stdio: [0, 1, 2] });
//     if (res.status !== 0) fail("WebIDL binding error.");
//     if (!fs.existsSync(glueFile + ".cpp") || !fs.existsSync(glueFile + ".js"))
//       fail("WebIDL binding error.");
//   }
//   if (glueFile) {
//     appendFilesSync(tmpInputFile, [glueFile + ".cpp"]);
//   }
//   args = ["--em-config", EM_CONFIG, "-s", "BINARYEN=1", "-O3"];
//   args.push(["-s", "NO_FILESYSTEM=1"]);
//   args.push(["-s", "NO_EXIT_RUNTIME=1"]);
//   args.push(["-s", "DISABLE_EXCEPTION_CATCHING=1"]);
//   args.push(["-s", "VERBOSE=1"]);

//   if (cliArgs.debuginfo) args.push("-g 3");
//   args.push(tmpInputFile);
//   let outputFile = cliArgs.output ? path.resolve(cliArgs.output) : path.resolve("a.js");
//   args.push(["-o", outputFile]);
//   if (glueFile) {
//     args.push(["--post-js", glueFile + ".js"]);
//   }
//   // console.info(EMCC + " " + args.join(" "));
//   res = spawnSync(EMCC, flatten(args), { stdio: [0, 1, 2] });
//   if (res.status !== 0) fail("Compilation error.");
//   let postfixes = [".asm.js", ".js", ".wasm", ".wast"];
//   let filename = path.join(path.dirname(outputFile), path.basename(outputFile, ".js"));
//   let outputFiles = postfixes.map(postfix => filename + postfix);
//   if (!outputFiles.every(file => fs.existsSync(file))) fail("Compilation error.");
// }

function getWasmSMCommandArgs(input) {
  var smAsNode = path.resolve(__dirname, '..', 'sm_as_node.js');
  return flatten(['-f', smAsNode, path.join(__dirname, "wasm-sm.js"), input]);
}

function disassemble() {
  let input = path.resolve(cliArgs.input);
  let args = getWasmSMCommandArgs(input);
  let res = spawnSync(JS, args, { stdio: [0, 1, 2] });
  if (res.status !== 0) fail("Disassembly error.");
}

function test() {
  let input = path.resolve("test/universe.wast");
  let args = getWasmSMCommandArgs(input);
  let res = spawnSync(JS, args);
  if (res.status !== 0) fail("Disassembly error.");
  let out = res.stdout.toString();
  if (out.indexOf("0x2a") < 0) fail("Can't find 42.");
}
