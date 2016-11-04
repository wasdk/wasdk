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

// Helper file to mock CommonJS require() loader.
var require = function (name) {
  var module = {exports: {}};
  var found = ['./node_modules', '../../node_modules'].some(prefix => {
    try {
      prefix = prefix + "/" + name + "/";
      var packageJsonPath = prefix + "package.json";
      var packageJson = JSON.parse(readRelativeToScript(packageJsonPath));
      var mainPath = prefix + packageJson.main;
      var body = readRelativeToScript(mainPath);
      var fn = new Function("module", "exports", "require", body);
      fn.call(module, module, module.exports, require);
      return true;
    } catch(_) {
      return false;
    }
  });
  if (!found)
    throw new Error('Module ' + name + ' was not found: ' + e);
  return module.exports;
};
