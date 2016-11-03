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

var decompress: (input: string, output: string, options?: any) => Promise<any> = require('decompress');
var logSymbols = require('log-symbols');

let filename = process.argv[2];
let dstPath = process.argv[3];
let strip = +process.argv[4];

function filterOutSymlinks(f: {path: string; type: string}) : boolean {
  return f.type !== 'link';
}

decompress(filename, dstPath, {strip: strip, filter: filterOutSymlinks }).then(() => {
  console.log(" " + logSymbols.success);
  process.exit(0);
}, (reason) => {
  console.log(" " + logSymbols.error);
  console.error(reason);
  process.exit(1);
});