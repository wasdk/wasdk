import * as fs from "fs-extra";
import * as tmp from "tmp";
import * as path from "path";
import { ASSEMBLER, EMCC, EM_CONFIG, spawnSync } from './shared';

function wast2wasmSync(wast: (string|Buffer)): ArrayBuffer {
  var inp, outp;
  try {
    inp = tmp.fileSync({postfix: '.wast'});
    fs.writeFileSync(inp.name, wast);
    outp = tmp.fileSync({postfix: '.wasm'});
    let res = spawnSync(ASSEMBLER, [inp.name, '-o', outp.name]);
    if (res.status !== 0)
      throw new Error("Wasm assembly error:\n" + res.stderr);
    var buf = fs.readFileSync(outp.name);
    return new Uint8Array(buf).buffer;
  } finally {
    if (inp) inp.removeCallback();
    if (outp) outp.removeCallback();
  }
}

export function wast2wasm(wast: (string|Buffer)): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    resolve(wast2wasmSync(wast));
  });
}
(<any>wast2wasm).sync = wast2wasmSync;

function cpp2wasmSync(code: (string|Buffer), isCpp: boolean = true): ArrayBuffer {
  var inp, outp, wasm;
  try {
    inp = tmp.fileSync({postfix: isCpp ? '.cpp' : '.c'});
    fs.writeFileSync(inp.name, code);
    outp = tmp.fileSync({postfix: '.js'});
    var args = [
      "--em-config", EM_CONFIG, "-s", "SIDE_MODULE=1", "-s", "BINARYEN=1", "-O3",
      inp.name, "-o", outp.name];
    let res = spawnSync(EMCC, args);
    if (res.status !== 0)
      throw new Error("Wasm assembly error:\n" + res.stderr);
    let wasm = path.join(path.dirname(outp.name),
      path.basename(outp.name, '.js') + '.wasm');
    var buf = fs.readFileSync(wasm);
    fs.unlinkSync(wasm);
    outp = void 0;
    return new Uint8Array(buf).buffer;
  } finally {
    if (inp) inp.removeCallback();
    if (outp) outp.removeCallback();
  }
}

export function cpp2wasm(code: (string|Buffer), isCpp: boolean = true): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    resolve(cpp2wasmSync(code, isCpp));
  });
}
(<any>cpp2wasm).sync = cpp2wasmSync;
