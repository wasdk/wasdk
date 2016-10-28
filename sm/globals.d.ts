declare let load: any;
declare let read: any;
declare var scriptArgs: any;
declare let wasmTextToBinary: any;
declare let wasmExtractCode: any;

declare interface WebAssemblyMemory {
  buffer: ArrayBuffer;
}

declare interface WebAssemblyMemoryConstructor {
  readonly prototype: WebAssemblyMemory;
  new (options: {
    initial: number, maximum?: number
  }): WebAssemblyMemory;
}


declare interface WebAssemblyInstance {
  exports: any;
}

declare interface WebAssemblyInstanceConstructor {
  readonly prototype: WebAssemblyInstance;
  new (module: WebAssemblyModule, imports: {}): WebAssemblyInstance;
}

declare interface WebAssemblyModule {

}

declare interface WebAssemblyModuleConstructor {
  readonly prototype: WebAssemblyModule;
  new (wasm: Uint8Array): WebAssemblyModule;
}

declare interface WebAssemblyTable {

}

declare interface WebAssemblyTableConstructor {
  readonly prototype: WebAssemblyTable;
  new (options: {
    initial: number, maximum?: number, element?: any
  }): WebAssemblyTable;
}

declare const WebAssembly: {
  Memory: WebAssemblyMemoryConstructor,
  Instance: WebAssemblyInstanceConstructor,
  Module: WebAssemblyModuleConstructor,
  Table: WebAssemblyTableConstructor
};
