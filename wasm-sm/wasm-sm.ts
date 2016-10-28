/// <reference path="../globals.d.ts"/>

declare let capstone: any;

load("lib/capstone.x86.min.js");

enum SectionID {
  User = 0, // User defined seection
  Type = 1, // 	Function signature declarations
  Import = 2, 	// Import declarations
  Function = 3, 	// Function declarations
  Table = 4, 	// Indirect function table and other tables
  Memory = 5, 	// Memory attributes
  Global = 6, 	// Global declarations
  Export = 7, 	// Exports
  Start = 8, 	// Start function declaration
  Element = 9, 	// Elements section
  Code = 10, 	// Function bodies (code)
  Data = 11 // Data segments
}
class WasmParser {
  offset = 0;
  position = 0;
  bytes: Uint8Array;
  constructor(offset: number, bytes: Uint8Array) {
    this.bytes = bytes;
    this.offset = offset;
    this.position = offset;
  }
  hasMoreBytes() {
    return this.position < this.bytes.length;
  }
  readUint32() {
    let p = this.position;
    let bytes = this.bytes;
    var n = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24);
    this.position += 4;
    return n;
  }
  readVarUInt7() {
    let b = this.bytes[this.position];
    this.position++;
    return b & 0x7F;
  }
  readBytes(length: number) {
    let bytes = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return bytes;
  }
  readVarUint32() {
    var n = 0, shift = 0, p = this.position, bytes = this.bytes;
    var b = bytes[p++];
    while (!!(b & 0x80)) {
      n |= (b & 0x7F) << shift;
      shift += 7;
      b = bytes[p++];
    }
    this.position = p;
    return n | (b << shift);
  }
  readNames(count: number) {
    let names = [];
    for (let i = 0; i < count; i++) names.push(this.readString(this.readVarUint32()));
    return names;
  }
  readString(len) {
    var ch = this.bytes.subarray(this.position, this.position + len);
    this.position += len;
    return String.fromCharCode.apply(null, ch);
  }
}

class WasmSection extends WasmParser {
  id: SectionID;
  constructor(offset: number, bytes: Uint8Array) {
    super(offset, bytes);
  }
  parseHeader() {
    this.id = this.readVarUInt7();
    this.readVarUint32();
  }
}
class WasmUserSection extends WasmSection {
  name: string;
  constructor(offset: number, bytes: Uint8Array) {
    super(offset, bytes);
  }
  parse() {
    this.parseHeader();
    this.name = this.readNames(1)[0];
  }
}

class WasmNameSection extends WasmUserSection {
  functionNames: string [] = [];
  functionLocalNames: string [][] = [];
  constructor(offset: number, bytes: Uint8Array) {
    super(offset, bytes);
  }
  parse() {
    super.parse();
    if (this.name !== "name") throw new Error('WASM: Invalid section name.');
    let functionCount = this.readVarUint32();
    for (let i = 0; i < functionCount; i++) {
      this.functionNames.push(this.readNames(1)[0]);
      this.functionLocalNames.push(this.readNames(this.readVarUint32()));
    }
  }
}

class WasmCodeSection extends WasmSection {
  functionBodies: Uint8Array [] = [];
  constructor(offset: number, bytes: Uint8Array) {
    super(offset, bytes);
  }
  parse() {
    this.parseHeader();
    let functionCount = this.readVarUint32();
    for (let i = 0; i < functionCount; i++) {
      let size = this.readVarUint32();
      this.functionBodies.push(this.readBytes(size));
    }
  }
}

class Wasm extends WasmParser {
  sections: WasmSection [] = [];
  constructor(bytes: Uint8Array) {
    super(0, bytes);
  }
  findSection(id: SectionID, name?: string) {
    for (let i = 0; i < this.sections.length; i++) {
      let section = this.sections[i];
      if (section.id === id) {
        if (id === SectionID.User) {
          let userSection = section as WasmUserSection;
          if (userSection.name === name) {
            return userSection;
          }
        } else {
          return section;
        }
      }
    }
    return null;
  }
  parse() {
    if (this.readUint32() != 0x6d736100) {
      throw new Error('WASM: Invalid magic number');
    }
    if (this.readUint32() != 13) {
      throw new Error('WASM: Invalid version number');
    }
    this.sections = [];
    while (this.hasMoreBytes()) {
      let section;
      let offset = this.position;
      let id = this.readVarUInt7();
      let payloadLength = this.readVarUint32();
      if (id === SectionID.User) {
        let name = this.readNames(1)[0];
        if (name === "name") {
          section = new WasmNameSection(offset, this.bytes);
          section.parse();
        }
      } else if (id === SectionID.Code) {
        section = new WasmCodeSection(offset, this.bytes);
        section.parse();
      }
      if (!section) section = new WasmSection(offset, this.bytes);
      this.sections.push(section);
      this.position += payloadLength;
    }
  }
}
declare var scriptArgs: any;


let wasm;
if (scriptArgs[0].endsWith(".wast")) {
  wasm = wasmTextToBinary(read(scriptArgs[0]));
} else {
  wasm = read(scriptArgs[0], "binary");
}
let m = new WebAssembly.Module(wasm);
let c = wasmExtractCode(m);
let wasmFile = new Wasm(wasm);
wasmFile.parse();

var cs = new capstone.Cs(capstone.ARCH_X86, capstone.MODE_64);

function padLeft(s: string, l: number, c: string) {
  while (s.length < l) s = c + s;
  return s;
}
function padRight(s: string, l: number, c: string) {
  while (s.length < l) s = s + c;
  return s;
}

let nameSection = wasmFile.findSection(SectionID.User, "name") as WasmNameSection;

function printFunctionMetrics() {
  let codeSection = wasmFile.findSection(SectionID.Code) as WasmCodeSection;
  let totalCodeSize = 0;
  let pairs = [];
  for (let i = 0; i < codeSection.functionBodies.length; i++) {
    let size = codeSection.functionBodies[i].length;
    totalCodeSize += size;
    let name = nameSection ? nameSection.functionNames[i] : `Func ${i}:`;
    pairs.push([name, size]);
  }
  console.log("Total Code Size: " + bytesToSize(totalCodeSize));
  pairs = pairs.sort((a, b) => a[1] < b[1] ? -1 : a[1] == b[1] ? 0 : 1);
  pairs.forEach(pair => {
    console.log(`${padRight((pair[1] / totalCodeSize * 100).toFixed(2) + "%", 10, ' ')} ${padRight(pair[1].toString(), 10, ' ')} ${pair[0]}`);
  });
}
printFunctionMetrics();

var x86JumpInstructions = [
  "jmp", "ja", "jae", "jb", "jbe", "jc", "je", "jg", "jge", "jl", "jle", "jna", "jnae",
  "jnb", "jnbe", "jnc", "jne", "jng", "jnge", "jnl", "jnle", "jno", "jnp", "jns", "jnz",
  "jo", "jp", "jpe", "jpo", "js", "jz"
];

function isBranch(instr) {
  return x86JumpInstructions.indexOf(instr.mnemonic) >= 0;
}

function toAddress(n) {
  var s = n.toString(16);
  while (s.length < 6) {
    s = "0" + s;
  }
  return "0x" + s;
}

function bytesToSize(bytes: number): string {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

function toBytes(a) {
  return a.map(function (x) { return padLeft(Number(x).toString(16), 2, "0"); }).join(" ");
}

let assemblyInstructionsByAddress = Object.create(null);

c.segments.forEach(s => {
  if (s.funcDefIndex === undefined) return;
  let begin = s.funcBodyBegin;
  let end = s.funcBodyEnd;
  let code = c.code.subarray(begin, end);
  if (nameSection) {
    console.log(nameSection.functionNames[s.funcDefIndex] + ":");
  } else {
    console.log(`Func ${s.funcDefIndex}:`);
  }
  var instructions = cs.disasm(code, begin);
  printInstructions(instructions);
});

function printInstructions(instructions: any []) {
  var pretty = true;
  var basicBlocks = {};
  instructions.forEach(function(instr, i) {
    assemblyInstructionsByAddress[instr.address] = instr;
    if (isBranch(instr)) {
      var targetAddress = parseInt(instr.op_str);
      if (!basicBlocks[targetAddress]) {
        basicBlocks[targetAddress] = [];
      }
      basicBlocks[targetAddress].push(instr.address);
      if (i + 1 < instructions.length) {
        basicBlocks[instructions[i + 1].address] = [];
      }
    }
  });
  instructions.forEach(function(instr) {
    let s = "";
    if (pretty) {
      if (basicBlocks[instr.address]) {
        s += " " + padRight(toAddress(instr.address) + ":", 51, " ");
        if (basicBlocks[instr.address].length > 0) {
          s += "; " + toAddress(instr.address) + " from: [" + basicBlocks[instr.address].map(toAddress).join(", ") + "]";
        }
        s += "\n";
      }
      s += "  " + padRight(instr.mnemonic + " " + instr.op_str, 50, " ");
      s += "; " + toAddress(instr.address) + " " + toBytes(instr.bytes);
    } else {
      s = padRight(instr.mnemonic + " " + instr.op_str, 50, " ") + " " + toBytes(instr.bytes);
    }
    console.log(s);
  });
}

cs.delete();
