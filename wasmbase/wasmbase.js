(function (factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        var v = factory(exports); if (v !== undefined) module.exports = v;
    }
    else if (typeof define === 'function' && define.amd) {
        define(["exports"], factory);
    }
})(function (exports) {
  var WASMBASE_MODULE_NAME = 'wasmbase';
  var INITIAL_MEMORY = 16 * 1024 * 1024;
  var MAXIMUM_MEMORY = 32 * 1024 * 1024;
  var WASM_PAGE_SIZE = 64 * 1024;
  var TABLE_SIZE = 0;
  var DYNAMICTOP_PTR = 0;

  var memory, table, malloc, free;
  var memoryBuf;

  var global = {
    NaN: NaN,
    Infinity: Infinity
  };

  function initNativeBase(module) {
    function nop(msg) {
      console.log("NOP: " + msg);
    }
    function enlargeMemory(size) {
      console.log("enlargeMemory: " + size);
    }
    function getTotalMemory() {
      return memoryBuf.byteLength;
    }

    var BASE = 0, STATIC_SIZE = 1024, STACK_SIZE = 1024;
    var stackTop = BASE + STATIC_SIZE;
    let stackMax = stackTop + STACK_SIZE;
    let staticBase = BASE;
    var env = {
      gb: staticBase,
      fb: 0,
      STACKTOP: stackTop,
      STACK_MAX: stackMax,
      DYNAMICTOP_PTR: DYNAMICTOP_PTR,
      ABORT: 0,
      tempDoublePtr: 0,
      enlargeMemory: enlargeMemory,
      getTotalMemory: getTotalMemory,
      abortOnCannotGrowMemory: nop.bind(null, "abortOnCannotGrowMemory"),
      _abort: this.nop.bind(null, "_abort"),
      _emscripten_memcpy_big: nop.bind(null, "_emscripten_memcpy_big"),
      ___setErrNo: nop.bind(null, "___setErrNo"),
      memory: memory,
      table: table,
      memoryBase: staticBase,
      tableBase: 0
    };
    var instance = new WebAssembly.Instance(module, {env: env, global: global});
    malloc = instance.exports._malloc;
    free = instance.exports._free;
  }
  function initJSBase() {
    var mptr = 16;
    malloc = function (size) {
      var asize = ((size + 7) & ~7) >>> 0;
      var p = mptr;
      mptr += asize;
      return p;
    };
    free = function (p) {
      // nothing
    };
  }
  var initialized = false;
  function ensureBaseInitailized() {
    if (initialized) return;

    memory = new WebAssembly.Memory({initial: INITIAL_MEMORY / WASM_PAGE_SIZE});
    table = new WebAssembly.Table({ initial: TABLE_SIZE, maximum: TABLE_SIZE, element: 'anyfunc' });

    memoryBuf = memory.buffer;

    if (_modules[WASMBASE_MODULE_NAME]) {
      initNativeBase(_modules[WASMBASE_MODULE_NAME]);
    } else {
      console.warn('Native wasmbase was not found -- using JS stubs.')
      initJSBase();
    }
  }
  var _modules = Object.create(null);
  var _modulesLoaded = [];
  function loadModule(name, code) {
    _modules[name] = new WebAssembly.Module(code);
  }
  function fetchModuleFromURL(name, url) {
    var p = fetch(url).then(function (req) {
      return req.arrayBuffer();
    }).then(function (resp) {
      loadModule(name, resp);
    });
    _modulesLoaded.push(p);
    return p;
  }
  function waitForModules() {
    return Promise.all(_modulesLoaded).then(function() {
      ensureBaseInitailized();
    });
  }
  function getWasmInstance(name, imports, options) {
    ensureBaseInitailized();

    var staticSize = (options && options.staticSize) | 1024;
    var stackSize = (options && options.stackSize) | 1024;
    var moduleMemorySize = staticSize + stackSize;

    var module = _modules[name];
    var moduleBase = malloc(moduleMemorySize);
    if (!moduleBase)
      throw new Error('Unable to allocate memory for module');

    var stackTop = moduleBase + staticSize;
    let stackMax = stackTop + stackSize;
    let staticBase = moduleBase;

    var env = Object.create(imports);
    env._malloc = malloc;
    env.__Znwj = malloc;
    env._free = free;
    env.__ZdlPv = free;
    env.memory = memory;
    env.table = table;
    env.staticBase = moduleBase;
    env.STACKTOP = moduleBase + staticSize;
    env.STACK_MAX = stackTop + stackSize;
    env.memoryBase = moduleBase;
    env.memoryBase = 0;
    env.tableBase = 0;

    return new WebAssembly.Instance(module, {env: env, global: global});
  }

  exports.getWasmInstance = getWasmInstance;
  exports.loadModule = loadModule;
  exports.fetchModuleFromURL = fetchModuleFromURL;
  exports.waitForModules = waitForModules;
  exports.getMallocAndFree = getMallocAndFree
});
