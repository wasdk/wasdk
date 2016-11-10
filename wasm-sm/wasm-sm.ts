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
/// <reference path="../globals.d.ts"/>

loadRelativeToScript("../sm_module_resolver.js");

import {
  BinaryReader, BinaryReaderState, SectionCode, bytesToString, INameEntry,
  IImportEntry, ExternalKind
} from 'wasmparser';

declare let capstone: any;

loadRelativeToScript("../lib/capstone.x86.min.js");

declare var scriptArgs: any;

function parseCodeMetricsAndNames(wasm: Uint8Array) {
  let reader = new BinaryReader();
  reader.setData(wasm.buffer, wasm.byteOffset, wasm.byteLength);

  let names = [];
  let sizes = [];
  let imports = 0;
  let funcIndex = 0;
  let funcIndexForNames = 0;
parsing:
  while (reader.read()) {
    switch (reader.state) {
      case BinaryReaderState.END_WASM:
        break parsing;
      case BinaryReaderState.ERROR:
        throw reader.error;
      case BinaryReaderState.BEGIN_SECTION:
        if (reader.currentSection.id != SectionCode.Code &&
            !(reader.currentSection.id == SectionCode.Custom && bytesToString(reader.currentSection.name) == "name") &&
            reader.currentSection.id != SectionCode.Import) {
           reader.skipSection();
        }
        break;
      case BinaryReaderState.IMPORT_SECTION_ENTRY:
        if ((<IImportEntry>reader.result).kind != ExternalKind.Function)
          break;
        sizes[funcIndex++] = 0;
        imports++;
        break;
      case BinaryReaderState.NAME_SECTION_ENTRY:
        let nameInfo = <INameEntry>reader.result;
        names[funcIndexForNames++] = bytesToString(nameInfo.funcName);
        break;
      case BinaryReaderState.BEGIN_FUNCTION_BODY:
        let size = reader.currentFunction.bodyEnd - reader.currentFunction.bodyStart;
        sizes[funcIndex++] = size;
        reader.skipFunctionBody();
        break;
      case BinaryReaderState.END_FUNCTION_BODY:
      case BinaryReaderState.END_SECTION:
        break;
    }
  }
  return {
    imports: imports,
    sizes: sizes,
    names: names
  };
}

let wasm;
if (scriptArgs[0].endsWith(".wast")) {
  wasm = wasmTextToBinary(read(scriptArgs[0]));
} else {
  wasm = read(scriptArgs[0], "binary");
}
let m = new WebAssembly.Module(wasm);
let c = wasmExtractCode(m);

var cs = new capstone.Cs(capstone.ARCH_X86, capstone.MODE_64);

function padLeft(s: string, l: number, c: string) {
  while (s.length < l) s = c + s;
  return s;
}
function padRight(s: string, l: number, c: string) {
  while (s.length < l) s = s + c;
  return s;
}

var metrics = parseCodeMetricsAndNames(wasm);

function printFunctionMetrics() {
  let totalCodeSize = 0;
  let pairs = [];
  for (let i = 0; i < metrics.sizes.length; i++) {
    let size = metrics.sizes[i];
    totalCodeSize += size;
    let name = metrics.names[i] || `Func ${i}:`;
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
  if (s.funcIndex === undefined) return;
  let begin = s.funcBodyBegin;
  let end = s.funcBodyEnd;
  let index = s.funcIndex;
  let code = c.code.subarray(begin, end);
  if (metrics.names[index]) {
    console.log(metrics.names[index] + ":");
  } else {
    console.log(`Func ${index}:`);
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
