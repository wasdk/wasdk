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
import * as tmp from "tmp";
import * as path from "path";
import * as http from "http";
import * as https from "https";

var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var logSymbols = require('log-symbols');
var spawnSyncFn = require('child_process').spawnSync;

export const WASDK_ROOT = path.resolve(path.dirname(path.dirname(__filename)));

export function spawnSync(command: string, args: any [], options?: any): any {
  WASDK_DEBUG && console.error(command + " " + args.join(" "));
  return spawnSyncFn(command, args, options);
}
export function pathFromRoot(...pathSegments: string []): string {
  pathSegments.unshift(WASDK_ROOT);
  return path.resolve.apply(path, pathSegments);
}
export function wasdkPath(pathSegment: string) {
  if (path.isAbsolute(pathSegment)) return pathSegment;
  return pathFromRoot(pathSegment);
}
export function ifWindows(s: string): string {
  return process.platform === 'win32' ? s : '';
}

export let WASDK_DEBUG = process.env.WASDK_DEBUG;
export let EM_CONFIG = pathFromRoot("bin", ".emscripten");
export let LLVM_ROOT = pathFromRoot("bin", "llvm");
export let EMSCRIPTEN_ROOT = pathFromRoot("bin", "emscripten");
export let BINARYEN_ROOT = pathFromRoot("bin", "binaryen");
export let SPIDERMONKEY_ROOT = pathFromRoot("bin", "spidermonkey");

export let EMCC = pathFromRoot("bin", "emscripten", "emcc" + ifWindows(".bat"));
export let JS = pathFromRoot(SPIDERMONKEY_ROOT, "js" + ifWindows(".exe"));

export let WEBIDL_BINDER = pathFromRoot("bin", "emscripten", "tools", "webidl_binder.py");
// export let TMP_DIR = tmp.dirSync().name;
export let TMP_DIR = pathFromRoot(".wasdk-tmp");

// console.log(`TMP_DIR = ${TMP_DIR}`);

export function fail(message) {
  throw new Error(message)
}
export function endsWith(subjectString: string, searchString: string): boolean {
  let position = subjectString.length;
  position -= searchString.length;
  var lastIndex = subjectString.lastIndexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
}
export function flatten(elements: any [], target?: any []) {
  if (!target) target = [];
  elements.forEach(element => {
    if (Array.isArray(element)) {
      flatten(element, target);
    } else {
      target.push(element);
    }
  });
  return target;
}
export function replaceBackslash(s: string): string {
  return s.split('\\').join('/');
}
export function doubleBackslash(s: string): string {
  return s.split('\\').join('\\\\');
}

export function writeEMConfig() {
  let str = `LLVM_ROOT = '${replaceBackslash(LLVM_ROOT)}'
EMSCRIPTEN_ROOT = '${replaceBackslash(EMSCRIPTEN_ROOT)}'
BINARYEN_ROOT = '${replaceBackslash(BINARYEN_ROOT)}'
NODE_JS = '${replaceBackslash(process.execPath)}'
COMPILER_ENGINE = NODE_JS
JS_ENGINES = [NODE_JS]`;
  fs.writeFileSync(EM_CONFIG, str);
}
export function appendFilesSync(output: string, input: string [], insertNewLine = false) {
  let files = input.map(file => fs.readFileSync(file, 'utf8'));
  files.forEach(file => {
    fs.appendFileSync(output, file);
    if (insertNewLine) {
      fs.appendFileSync(output, "\n");
    }
  });
}
function element<T>(array: T[], i): T {
  if (i >= 0) return array[i];
  return array[array.length + i];
}
export function pathLooksLikeDirectory(path: string) {
  if (path === ".") return true;
  let lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  let lastDot = path.lastIndexOf('.');
  let noSuffix = lastDot < lastSlash || lastDot === -1;
  if (noSuffix) return true;
  let suffix = path.substr(lastDot);
  if (suffix === ".exe" || suffix == ".zip") return false;
  return true;
}
export function ensureDirectoryCreatedSync(path: string) {
  mkdirp.sync(path);
}
export function downloadFileSync(url: string, dstPath: string, downloadEvenIfExists = false, filenamePrefix = ""): string {
  let filename = filenamePrefix + element(url.split("/"), -1);
  if (pathLooksLikeDirectory(dstPath)) {
    filename = path.join(dstPath, filename);
  } else {
    filename = dstPath;
  }
  filename = wasdkPath(filename);
  mkdirp.sync(path.dirname(filename));
  if (fs.existsSync(filename) && !downloadEvenIfExists) {
    // console.log(`File ${filename} already downloaded, skipping.`);
    console.log(`File already downloaded, skipping.`);
    return filename;
  }
  // process.stdout.write(`Downloading ${url}: `);
  process.stdout.write(`Downloading `);
  if (spawnDownloadFileSync(url, filename)) return filename;
}
function spawnDownloadFileSync(url: string, filename: string): boolean {
  let req = JSON.stringify({url, filename});
  let res = spawnSync(process.execPath, [require.resolve('./download.js'), url, filename], {
    stdio: [0, 1, 2]
  });
  if (res.status !== 0) fail(res.stderr.toString());
  return fs.existsSync(filename);
}
export function decompressFileSync(filename: string, dstPath: string, strip = 0): boolean {
  dstPath = wasdkPath(dstPath);
  mkdirp.sync(dstPath);
  process.stdout.write(`Unpacking`);
  let res = spawnSync(process.execPath, [require.resolve('./unpack.js'), filename, dstPath, strip], {
    stdio: [0, 1, 2]
  });
  if (res.status !== 0) fail(res.stderr.toString());
  return true;
}
export function deleteFileSync(filename: string) {
  filename = wasdkPath(filename);
  rimraf.sync(filename);
}
export function createTmpFile(): string {
  return tmp.fileSync({template: `${TMP_DIR}/tmp-XXXXXX`}).name;
}

export class IndentingWriter {
  w: fs.WriteStream;
  i: number;
  constructor(path: string) {
    this.i = 0;
    this.w = fs.createWriteStream(path);
  }
  getIndent(): string {
    let s = "";
    let i = 0;
    while (i++ < this.i) {
      s += "  ";
    }
    return s;
  }
  writeLn(s: string) {
    this.w.write(this.getIndent() + s + "\n");
  }
  enter(s: string) {
    this.writeLn(s);
    this.i++;
  }
  leave(s: string) {
    this.i--;
    this.writeLn(s);
  }
  end() {
    this.w.end();
  }
}
