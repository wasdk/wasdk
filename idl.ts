var WebIDL2 = require("webidl2");

export module IDL {
  export function parse(s: string): IDLInterface [] {
    return WebIDL2.parse(s);
  }

  interface IDLElement {
    type: "interface" | "attribute" | "operation";
  }
  interface IDLType {
    idlType: any;
  }
  interface IDLAttribute extends IDLElement {
    name: string;
    idlType: IDLType;
  }
  interface IDLOperation extends IDLElement {
    name: string;
    idlType: IDLType;
    arguments: IDLArgument [];
  }
  interface IDLArgument extends IDLElement {
    name: string;
    idlType: IDLType;
  }
  interface IDLInterface extends IDLElement {
    name: string;
    members: (IDLAttribute | IDLOperation) [];
  }
  function isPrimitiveType(t: IDLType): boolean {
    switch (t.idlType) {
      case "int": return true;
    }
    return false;
  }
  function typeToJS(t: IDLType): string {
    if (t.idlType === "int") {
      return "number /* int */";
    } else {
      return t.idlType;
    }
  }
  function typeToC(t: IDLType): string {
    switch (t.idlType) {
      case "Long":
        return "int";
      case "UnsignedLong":
        return "unsigned int";
      case "Short":
        return "short";
      case "UnsignedShort":
        return "unsigned short";
      case "Byte":
        return "char";
      case "Octet":
        return "unsigned char";
      case "Void":
        return "void";
      case "String":
        return "char*";
      case "Float":
        return "float";
      case "Double":
        return "double";
      case "Boolean":
        return "bool";
      default: return t.idlType;
    }
  }
  function argumentsToString(v: IDLArgument []): string {
    function doArgument(a: IDLArgument) {
      return a.name + ": " + typeToJS(a.idlType);
    }
    return v.map(doArgument).join(", ");
  }

  export function getInterfaceByName(name: string, interfaces: IDLInterface []): IDLInterface {
    return interfaces.find(i => i.name === name);
  }
}

// function renderAttribute(i: IDLInterface, v: IDLAttribute) {
//   // tFile.writeLn(v.name + `: ${typeToString(v.idlType)};`);
//   let name = i.name + "_get_" + v.name;
//   tFile.enter(`get ${v.name} () {`);
//   tFile.writeLn(`return Module.${name} (this.ptr);`);
//   tFile.leave("}");
//   hFile.writeLn(`${typeToC(v.idlType)} ${name} (${i.name} *self) { return self->${v.name}; }`);
// }
// function renderOperation(i: IDLInterface, v: IDLOperation) {
//   tFile.enter(v.name + `(${argumentsToString(v.arguments)}): ${typeToJS(v.idlType)} {`);
//   let args = v.arguments.map(a => {
//     // console.dir(a);
//     // a.name
//     if (isPrimitiveType(a.idlType)) {
//       return a.name;
//     } else {
//       return a.name + ".ptr";
//     }
//   }).join(", ");
//   tFile.writeLn("return Module." + i.name + "_" + v.name + `(${args});`);
//   tFile.leave("}");
//   // hFile.writeLn
// }
// function renderInterface(i: IDLInterface) {
//   tFile.enter("class " + i.name + " {");
//   tFile.writeLn("ptr: number;");
//   i.members.forEach(m => {
//     if (m.type === "attribute") {
//       renderAttribute(i, m as IDLAttribute);
//     } else if (m.type === "operation") {
//       renderOperation(i, m as IDLOperation);
//     } else {
//       console.dir(m);
//     }
//   });
//   tFile.leave("}");
// }