declare let load: any;
declare let wasmTextToBinary: any;
declare let read: any;
declare let WebAssembly: any;
declare let wasmExtractCode: any;
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
    if (this.readUint32() != 12) {
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

// print(JSON.stringify(m, null, 2));
// print(JSON.stringify(c.segments, null, 2));
// print(JSON.stringify(c, null, 2));

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

function toBytes(a) {
  return a.map(function (x) { return padLeft(Number(x).toString(16), 2, "0"); }).join(" ");
}

let assemblyInstructionsByAddress = Object.create(null);

c.segments.forEach(s => {
  if (!s.funcDefIndex) return;
  let begin = s.funcBodyBegin;
  let end = s.funcBodyEnd;
  let code = c.code.subarray(begin, end);
  console.log(nameSection.functionNames[s.funcDefIndex] + ":");
  var instructions = cs.disasm(code, begin);
  printInstructions(instructions);
});

function printInstructions(instructions: any []) {
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
    if (basicBlocks[instr.address]) {
      s += " " + padRight(toAddress(instr.address) + ":", 39, " ");
      if (basicBlocks[instr.address].length > 0) {
        s += "; " + toAddress(instr.address) + " from: [" + basicBlocks[instr.address].map(toAddress).join(", ") + "]";
      }
      s += "\n";
    }
    s += "  " + padRight(instr.mnemonic + " " + instr.op_str, 38, " ");
    s += "; " + toAddress(instr.address) + " " + toBytes(instr.bytes);
    console.log(s);
  });
}

cs.delete();


  // function getWasmDebugInfo(wasmBytes) {
  //   function readString(len) {
  //     var ch = wasmBytes.subarray(pos, pos + len);
  //     pos += len;
  //     return String.fromCharCode.apply(null, ch);
  //   }

  //   var pos = 0;
  //   if (readUint32() != 0x6d736100) {
  //     throw new Error('WASM: Invalid magic number');
  //   }
  //   if (readUint32() != 10) {
  //     throw new Error('WASM: Invalid version number');
  //   }
  //   var dbgTablesStart = -1, dbgTablesEnd;
  //   var functionsStart = -1, functionsEnd;
  //   while (pos < wasmBytes.length) {
  //     var sectionSize = readVarUint32();
  //     var sectionEnd = pos + sectionSize;
  //     var id = readString(readVarUint32());
  //     if (id === "_experiment_dbg_tables") {
  //       dbgTablesStart = pos;
  //       dbgTablesEnd = sectionEnd;
  //     } else if (id === "function_bodies") {
  //       functionsStart = pos;
  //       functionsEnd = sectionEnd;
  //     }
  //     pos = sectionEnd;
  //   }
  //   if (dbgTablesStart < 0) {
  //     return null;
  //   }
  //   var tables = [];
  //   pos = dbgTablesStart;
  //   var count = readVarUint32();
  //   while (count--) {
  //     var len = readVarUint32();
  //     tables.push(String.fromCharCode.apply(null, wasmBytes.subarray(pos, pos + len)));
  //     pos += len;
  //   }
  //   return tables;

// var instructions = cs.disasm(csBuffer, region.entry);
// var basicBlocks = {};
// instructions.forEach(function(instr, i) {
// }
// print(cs);

// print(Object.keys(c.segments));
// print(m);
// wasmBinaryToText(wasm);
// let m = wasmEval(wasm);

// declare var wasmTextToBinary: any;
// declare var WebAssembly: any;
// declare var read: any;
// declare var scriptArgs: any;

// function wasmEvalText(str: string, imports) {
//     let binary = wasmTextToBinary(str);
//     let valid = WebAssembly.validate(binary);

//     let m;
//     try {
//       m = new WebAssembly.Module(binary);
//     } catch(e) {
//       throw e;
//     }

//     return new WebAssembly.Instance(m, imports);
// }

// function evalWasm(wasm, imports) {
//   let m = new WebAssembly.Module(wasm);
//   return new WebAssembly.Instance(m, imports);
// }

// let wast = read(scriptArgs[0]);
// let i = wasmEvalText(wast, {});
// // print(i.exports.Point_get_x);

// // print(wasm);
// // let valid = WebAssembly.validate(wasm);

// // wasmEvalText(wast, {});

