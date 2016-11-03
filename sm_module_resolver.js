// Helper file to mock CommonJS require() loader.
var require = function (name) {
  var module = {exports: {}};
  try {
    var prefix = "./node_modules/" + name + "/";
    var packageJsonPath = prefix + "package.json";
    var packageJson = JSON.parse(readRelativeToScript(packageJsonPath));
    var mainPath = prefix + packageJson.main;
    var body = readRelativeToScript(mainPath);
    var fn = new Function("module", "exports", "require", body);
    fn.call(module, module, module.exports, require);
    return module.exports;
  } catch (e) {
    throw new Error('Module ' + name + ' was not found: ' + e);
  }
};
