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
      }).on('end', function (chunk) {
        console.log(" " + logSymbols.success);
        file.end();
        resolve(path);
      }).pipe(file);
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