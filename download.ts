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
import * as http from "http";
import * as https from "https";
var logSymbols = require('log-symbols');
declare var Math: any;
function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + sizes[i];
};
function downloadFile(url: string, path: string): Promise<any> {
  var file = fs.createWriteStream(path);
  return new Promise((resolve, reject) => {
    let httpOrHttps: any = url.indexOf("https") === 0 ? https : http;
    var request = httpOrHttps.get(url, function (response) {
      var length = parseInt(response.headers['content-length'], 10);
      process.stdout.write(bytesToSize(length) + " ");
      var down = 0;
      var maxTicks = 16;
      response.on('data', function (chunk) {
        let last = down;
        down += chunk.length;
        let lastTicks = ((last / length) * maxTicks) | 0;
        let currTicks = ((down / length) * maxTicks) | 0;
        for (let i = lastTicks; i < currTicks; i++) {
          process.stdout.write(".");
        }
      }).pipe(file).on('finish', function () {
        console.log(" " + logSymbols.success);
        file.end();
        resolve(path);
      });
    }).on('error', function () {
      console.log(" " + logSymbols.error);
      file.end();
      reject();
    });
  });
}

let url = process.argv[2];
let dst = process.argv[3];

downloadFile(url, dst).then(() => {
  process.exit(0);
}, () => {
  process.exit(1);
});