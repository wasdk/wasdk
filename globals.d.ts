declare let load: any;
declare let read: any;
declare var scriptArgs: any;
declare let wasmTextToBinary: any;
declare let wasmExtractCode: any;

declare interface Promise<T> { }

// Created From:
// https://hg.mozilla.org/mozilla-central/file/tip/js/src/jit-test/tests/wasm/jsapi.js
// and
// https://github.com/WebAssembly/design/blob/master/JS.md

declare interface WebAssemblyMemory {
  buffer: ArrayBuffer;
  grow: (delta: number) => void;
}

declare interface WebAssemblyMemoryDescriptor {
  initial: number;
  maximum?: number;
}

declare interface WebAssemblyMemoryConstructor {
  readonly prototype: WebAssemblyMemory;
  new (memoryDescriptor: WebAssemblyMemoryDescriptor): WebAssemblyMemory;
}

declare interface WebAssemblyInstance {
  exports: any;
}

declare interface WebAssemblyInstanceConstructor {
  readonly prototype: WebAssemblyInstance;
  new (modulObject: WebAssemblyModule, importObject?: any): WebAssemblyInstance;
}

declare interface WebAssemblyModule {

}

declare interface WebAssemblyModuleConstructor {
  readonly prototype: WebAssemblyModule;
  new (bytes: BufferSource): WebAssemblyModule;
}

declare interface WebAssemblyTableDescriptor {
  initial: number;
  maximum?: number;
  element?: string;
}

declare interface WebAssemblyTable {
  length: number;
  grow: (delta: number) => void;
  get: (index: number) => any;
  set: (index: number, value: any) => void;
}

declare interface WebAssemblyTableConstructor {
  readonly prototype: WebAssemblyTable;
  new (tableDescriptor: WebAssemblyTableDescriptor): WebAssemblyTable;
}

declare interface WebAssemblyCompileError extends Error {

}

declare interface WebAssemblyRuntimeError extends Error {

}

declare const WebAssembly: {
  Memory: WebAssemblyMemoryConstructor,
  Instance: WebAssemblyInstanceConstructor,
  Module: WebAssemblyModuleConstructor,
  Table: WebAssemblyTableConstructor,
  CompileError: WebAssemblyCompileError,
  RuntimeError: WebAssemblyRuntimeError,
  validate: (bytes: BufferSource) => boolean,
  compile: (bytes: BufferSource) => Promise<WebAssemblyModule>
};
