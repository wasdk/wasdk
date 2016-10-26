#! /usr/bin/env node

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