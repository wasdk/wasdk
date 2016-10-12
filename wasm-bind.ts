#! /usr/bin/env node

import * as fs from "fs";
var WebIDL2 = require("webidl2");
import { ArgumentParser } from "argparse";

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

var k = WebIDL2.parse(fs.readFileSync(args.input).toString());

class Writer {
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

var hFile = new Writer(args.input + ".h");
hFile.enter('extern "C" {');

var tFile = new Writer(args.input + ".ts");

interface IDLElement {
  type: "interface" | "attribute" | "operation";
}
interface IDLType {
  idlType: any;
}
interface IDLAttribute extends IDLElement {
  name: string;
  idlType: IDLType;
}
interface IDLOperation extends IDLElement {
  name: string;
  idlType: IDLType;
  arguments: IDLArgument [];
}
interface IDLArgument extends IDLElement {
  name: string;
  idlType: IDLType;
}
interface IDLInterface extends IDLElement {
  name: string;
  members: (IDLAttribute | IDLOperation) [];
}
function isPrimitiveType(t: IDLType): boolean {
  switch (t.idlType) {
    case "int": return true;
  }
  return false;
}
function typeToJS(t: IDLType): string {
  if (t.idlType === "int") {
    return "number /* int */";
  } else {
    return t.idlType;
  }
}
function typeToC(t: IDLType): string {
  switch (t.idlType) {
    case "Long":
      return "int";
    case "UnsignedLong":
      return "unsigned int";
    case "Short":
      return "short";
    case "UnsignedShort":
      return "unsigned short";
    case "Byte":
      return "char";
    case "Octet":
      return "unsigned char";
    case "Void":
      return "void";
    case "String":
      return "char*";
    case "Float":
      return "float";
    case "Double":
      return "double";
    case "Boolean":
      return "bool";
    default: return t.idlType;
  }
}
function argumentsToString(v: IDLArgument []): string {
  function doArgument(a: IDLArgument) {
    return a.name + ": " + typeToJS(a.idlType);
  }
  return v.map(doArgument).join(", ");
}
function renderAttribute(i: IDLInterface, v: IDLAttribute) {
  // tFile.writeLn(v.name + `: ${typeToString(v.idlType)};`);
  let name = i.name + "_get_" + v.name;
  tFile.enter(`get ${v.name} () {`);
  tFile.writeLn(`return ${name} (this.ptr);`);
  tFile.leave("}");
  hFile.writeLn(`${typeToC(v.idlType)} ${name} (${i.name} *self) { return self->${v.name}; }`);
}
function renderOperation(i: IDLInterface, v: IDLOperation) {
  tFile.enter(v.name + `(${argumentsToString(v.arguments)}): ${typeToJS(v.idlType)} {`);
  let args = v.arguments.map(a => {
    // console.dir(a);
    // a.name
    if (isPrimitiveType(a.idlType)) {
      return a.name;
    } else {
      return a.name + ".ptr";
    }
  }).join(", ");
  tFile.writeLn("return " + i.name + "_" + v.name + `(${args});`);
  tFile.leave("}");
  // hFile.writeLn
}
function renderInterface(i: IDLInterface) {
  tFile.enter("class " + i.name + " {");
  tFile.writeLn("ptr: number;");
  i.members.forEach(m => {
    if (m.type === "attribute") {
      renderAttribute(i, m as IDLAttribute);
    } else if (m.type === "operation") {
      renderOperation(i, m as IDLOperation);
    } else {
      console.dir(m);
    }
  });
  tFile.leave("}");
}

// This is very incomplete.
renderInterface(k[0])

// console.dir(k, {depth: 10});

hFile.leave("}");
hFile.end();
tFile.end();