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
/// <reference path="./globals.d.ts"/>

let wasm: any, memorywasm: any;

let INITIAL_MEMORY = 16 * 1024 * 1024;
let MAXIMUM_MEMORY = 32 * 1024 * 1024;
let WASM_PAGE_SIZE = 64 * 1024;
let TABLE_SIZE = 0;
let DYNAMICTOP_PTR = 0;


let memory = new WebAssembly.Memory({
  initial: INITIAL_MEMORY / WASM_PAGE_SIZE,
  // maximum: MAXIMUM_MEMORY / WASM_PAGE_SIZE
});


let buffer = memory.buffer;
let HEAP8 = new Int8Array(buffer);
let HEAP16 = new Int16Array(buffer);
let HEAP32 = new Int32Array(buffer);
let HEAPU8 = new Uint8Array(buffer);
let HEAPU16 = new Uint16Array(buffer);
let HEAPU32 = new Uint32Array(buffer);
let HEAPF32 = new Float32Array(buffer);
let HEAPF64 = new Float64Array(buffer);

/**

+--------------------------------------+
|            DYNAMICTOP_PTR            |
+--------------------------------------+
|             Root Module              |
|  +-----------------------------------+ <---------  Static Base
|  |              Static               |
|  +-----------------------------------+ <---------  Stack Base
|  |               Stack               |
+--------------------------------------+ <---------  Stack Top
|             Malloc Area              |
|  +-----------------------------------+
|  |             Module 1              |
|  +-----------------------------------+
|  |             Module n              |
|  +-----------------------------------+
|  |                ...                |
|  +-----------------------------------+
|                                      |
+--------------------------------------+ <---------  Dynamic Top

*/

HEAP32[DYNAMICTOP_PTR >> 2] = 1024 * 2;

class ModuleOptions {
  staticBase: number = -1;
  staticSize: number = -1;
  stackBase: number = -1;
  stackSize: number = -1;

  constructor(base: number, staticSize = 1024, stackSize = 1024) {
    this.staticBase = base;
    this.staticSize = staticSize;
    this.stackBase = this.staticBase + this.staticSize;
    this.stackSize = stackSize;
  }
}

class Module {
  module: WebAssemblyModule = null;
  memory: WebAssemblyMemory = null;
  table: WebAssemblyTable = null;
  instance: WebAssemblyInstance = null;
  environment: any;
  options: ModuleOptions;
  constructor(module: WebAssemblyModule, memory: WebAssemblyMemory, table: WebAssemblyTable, options: ModuleOptions, malloc?: MallocModule) {
    this.module = module;
    this.memory = memory;
    this.table = table;
    this.options = options;
    this.instance = new WebAssembly.Instance(module, {
      env: this.createEnvironment(malloc),
      global: {
        NaN: NaN,
        Infinity: Infinity
      }
    });
  }
  createEnvironment(malloc?: MallocModule) {
    let stackTop = this.options.stackBase;
    let stackMax = stackTop + this.options.stackSize;
    let staticBase = this.options.staticBase;

    var env: any = {
      gb: staticBase,
      fb: 0,
      STACKTOP: stackTop,
      STACK_MAX: stackMax,
      DYNAMICTOP_PTR: DYNAMICTOP_PTR,
      ABORT: 0,
      tempDoublePtr: 0,
      enlargeMemory: this.enlargeMemory,
      getTotalMemory: this.getTotalMemory,
      abortOnCannotGrowMemory: this.nop.bind(this, "abortOnCannotGrowMemory"),
      _abort: this.nop.bind(this, "_abort"),
      _emscripten_memcpy_big: this.nop.bind(this, "_emscripten_memcpy_big"),
      ___setErrNo: this.nop.bind(this, "___setErrNo"),
      _print: function (i) { console.log(`[print: ${i}]`); },
      memory: this.memory,
      table: this.table,
      memoryBase: staticBase,
      tableBase: 0
    };
    if (malloc)
      malloc.extendEnvironment(env);
    return env;
  }
  nop(s: string) {
    console.log("NOP: " + s);
  }
  enlargeMemory(size) {
    console.log("enlargeMemory: " + size);
  }
  getTotalMemory() {
    return this.memory.buffer.byteLength;
  }
  exports(): any {
    return this.instance.exports;
  }
}

class MallocModule extends Module {
  constructor(module: WebAssemblyModule, memory: WebAssemblyMemory, table: WebAssemblyTable, options: ModuleOptions) {
    super(module, memory, table, options);
  }
  malloc(size: number) {
    return this.exports()._malloc(size);
  }
  extendEnvironment(env: any): void {
    env._malloc = this.instance.exports._malloc;
    env._free = this.instance.exports._free;
  }
}

if (scriptArgs[0].endsWith(".wast")) {
  wasm = wasmTextToBinary(read(scriptArgs[0]));
} else {
  wasm = read(scriptArgs[0], "binary");
}

if (scriptArgs[1].endsWith(".wast")) {
  memorywasm = wasmTextToBinary(read(scriptArgs[1]));
} else {
  memorywasm = read(scriptArgs[1], "binary");
}

let mm = new WebAssembly.Module(memorywasm);
let m = new WebAssembly.Module(wasm);

let table = new WebAssembly.Table({ initial: TABLE_SIZE, maximum: TABLE_SIZE, element: 'anyfunc' });
let rootModule = new MallocModule(mm, memory, table, new ModuleOptions(1024));

// Create a root malloc modules and some child modules.

let modules = [];

for (let i = 0; i < 16; i++) {
  let base = rootModule.malloc(WASM_PAGE_SIZE);
  let childModule = new Module(m, memory, table, new ModuleOptions(base),rootModule);
  modules.push(childModule);
  // print("MALLOC: " + module.malloc(12));
}

for (let j = 0; j < 16; j++) {
  modules.forEach((m, i) => {
    console.log("Module " + i);
    m.exports()._test();
  });
}
