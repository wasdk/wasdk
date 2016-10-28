/// <reference path="./globals.d.ts"/>

let wasm: any;

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
  constructor(module: WebAssemblyModule, memory: WebAssemblyMemory, table: WebAssemblyTable, options: ModuleOptions) {
    this.module = module;
    this.memory = memory;
    this.table = table;
    this.options = options;
    this.instance = new WebAssembly.Instance(module, {
      env: this.createEnvironment(),
      global: {
        NaN: NaN,
        Infinity: Infinity
      }
    });
  }
  createEnvironment() {
    let stackTop = this.options.stackBase;
    let stackMax = stackTop + this.options.stackSize;
    let staticBase = this.options.staticBase;

    return {
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
      memory: this.memory,
      table: this.table,
      memoryBase: staticBase,
      tableBase: 0
    }
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
}

class MallocModule extends Module {
  constructor(module: WebAssemblyModule, memory: WebAssemblyMemory, table: WebAssemblyTable, options: ModuleOptions) {
    super(module, memory, table, options);
  }
  malloc(size: number) {
    return this.instance.exports._malloc(size);
  }
}

if (scriptArgs[0].endsWith(".wast")) {
  wasm = wasmTextToBinary(read(scriptArgs[0]));
} else {
  wasm = read(scriptArgs[0], "binary");
}

let m = new WebAssembly.Module(wasm);

let table = new WebAssembly.Table({ initial: TABLE_SIZE, maximum: TABLE_SIZE, element: 'anyfunc' });
let rootModule = new MallocModule(m, memory, table, new ModuleOptions(1024));

// Create a root malloc modules and some child modules.

let modules = [];

for (let i = 0; i < 16; i++) {
  let base = rootModule.malloc(WASM_PAGE_SIZE);
  let childModule = new MallocModule(m, memory, table, new ModuleOptions(base));
  modules.push(childModule);
  // print("MALLOC: " + module.malloc(12));
}

for (let j = 0; j < 64; j++) {
  modules.forEach((m, i) => {
    console.log("Module " + i);
    for (let k = 0; k < 16; k++) {
      console.log(" " + m.malloc(12));
    }
  });
}