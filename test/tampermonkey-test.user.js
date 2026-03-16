// ==UserScript==
// @name         Tampermonkey 测试脚本
// @namespace    https://0xffff87.github.io/test
// @version      0.1
// @description  测试 Tampermonkey 是否正常工作
// @author       test
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('[测试脚本] Tampermonkey 正常工作！页面: ' + location.href);

  var btn = document.createElement('button');
  btn.textContent = '测试按钮';
  btn.style.cssText = 'position:fixed;bottom:100px;right:30px;z-index:2147483647;background:red;color:white;border:none;border-radius:50%;width:60px;height:60px;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);';
  btn.onclick = function() { alert('Tampermonkey 工作正常！'); };
  document.body.appendChild(btn);
})();
