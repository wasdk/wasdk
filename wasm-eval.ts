
declare var wasmTextToBinary: any;
declare var WebAssembly: any;

function wasmEvalText(str: string, imports) {
    let binary = wasmTextToBinary(str);
    let valid = WebAssembly.validate(binary);

    let m;
    try {
      m = new WebAssembly.Module(binary);
    } catch(e) {
      throw e;
    }

    return new WebAssembly.Instance(m, imports);
}

function evalWasm(wasm, imports) {
  let m = new WebAssembly.Module(wasm);
  return new WebAssembly.Instance(m, imports);
}

let wasm = read(scriptArgs[0], "binary");
evalWasm(wasm);
// print(wasm);
// let valid = WebAssembly.validate(wasm);

// wasmEvalText(wast, {});

