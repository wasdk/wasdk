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

import * as fs from "fs";

import { ArgumentParser } from "argparse";
import { IDL } from "./idl";

var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'WebIDL Wasm Bindings Generator'
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
    help: 'Input file.',
  }
);

var args = parser.parseArgs();

var k = IDL.parse(fs.readFileSync(args.input).toString());
// var k = WebIDL2.parse(fs.readFileSync(args.input).toString());

// var hFile = new Writer(args.input + ".h");
// hFile.enter('extern "C" {');

// var tFile = new Writer(args.input + ".ts");



// // This is very incomplete.
// renderInterface(k[0])

// console.dir(k, {depth: 10});

let i = IDL.getInterfaceByName("Module", k);
let members = i.members.filter(m => m.type === "operation").map(m => m.name);
console.dir(members);
// console.dir(getIDLInterface("Module", k));

// hFile.leave("}");
// hFile.end();
// tFile.end();