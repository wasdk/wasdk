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
import * as path from "path";

import {
  setVerbose, replaceBackslash, spawnDownloadFileSync, ifWindows,
  pathLooksLikeDirectory, downloadFileSync as downloadFileSync_utils
} from 'wasdk-utils';

export {
  appendFilesSync, spawnSync, fail, pathLooksLikeDirectory, endsWith,
  flatten, createTmpFile, decompressFileSync, deleteFileSync,
  ensureDirectoryCreatedSync, TMP_DIR
} from 'wasdk-utils';

export let WASDK_DEBUG = process.env.WASDK_DEBUG;
setVerbose(WASDK_DEBUG);

export const WASDK_ROOT = path.resolve(path.dirname(path.dirname(__filename)));

export function pathFromRoot(...pathSegments: string []): string {
  pathSegments.unshift(WASDK_ROOT);
  return path.resolve.apply(path, pathSegments);
}
export function wasdkPath(pathSegment: string) {
  if (path.isAbsolute(pathSegment)) return pathSegment;
  return pathFromRoot(pathSegment);
}

export let EM_CONFIG = pathFromRoot("bin", ".emscripten");
export let LLVM_ROOT = pathFromRoot("bin", "llvm");
export let EMSCRIPTEN_ROOT = pathFromRoot("bin", "emscripten");
export let BINARYEN_ROOT = pathFromRoot("bin", "binaryen");
export let SPIDERMONKEY_ROOT = pathFromRoot("bin", "spidermonkey");

export let EMCC = path.join(EMSCRIPTEN_ROOT, "emcc" + ifWindows(".bat"));
export let JS = path.join(SPIDERMONKEY_ROOT, "js" + ifWindows(".exe"));
export let DISASSEMBLER = path.join(BINARYEN_ROOT, "bin", "wasm-dis" + ifWindows(".exe"));
export let WEBIDL_BINDER = path.join(EMSCRIPTEN_ROOT, "tools", "webidl_binder.py");

export function writeEMConfig() {
  let str = `LLVM_ROOT = '${replaceBackslash(LLVM_ROOT)}'
EMSCRIPTEN_ROOT = '${replaceBackslash(EMSCRIPTEN_ROOT)}'
BINARYEN_ROOT = '${replaceBackslash(BINARYEN_ROOT)}'
NODE_JS = '${replaceBackslash(process.execPath)}'
COMPILER_ENGINE = NODE_JS
JS_ENGINES = [NODE_JS]`;
  fs.writeFileSync(EM_CONFIG, str);
}

function element<T>(array: T[], i): T {
  if (i >= 0) return array[i];
  return array[array.length + i];
}

export function downloadFileSync(url: string, dstPath: string, downloadEvenIfExists = false, filenamePrefix = ""): string {
  let filename = filenamePrefix + element(url.split("/"), -1);
  if (pathLooksLikeDirectory(dstPath)) {
    filename = path.join(dstPath, filename);
  } else {
    filename = dstPath;
  }
  filename = wasdkPath(filename);
  if (downloadFileSync_utils(url, filename, downloadEvenIfExists)) return filename;
}
