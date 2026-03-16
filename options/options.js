/**
 * 简历投递助手 - 选项页逻辑
 * 管理后端服务配置（AI 由后端统一管理，无需在此配置）
 */

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function loadConfig() {
  chrome.storage.local.get('backendConfig', (result) => {
    const bc = result.backendConfig || {};
    document.getElementById('serverUrl').value = bc.serverUrl || '';
    document.getElementById('pluginKey').value = bc.pluginKey || '';
  });
}

function saveConfig() {
  const backendConfig = {
    serverUrl: document.getElementById('serverUrl').value.trim(),
    pluginKey: document.getElementById('pluginKey').value.trim(),
  };

  if (!backendConfig.serverUrl) {
    showToast('请填写服务器地址', 'error');
    return;
  }

  if (!backendConfig.pluginKey) {
    showToast('请填写插件密钥', 'error');
    return;
  }

  chrome.storage.local.set({ backendConfig }, () => {
    showToast('设置已保存', 'success');
  });
}

async function testBackend() {
  const btn = document.getElementById('btn-test-backend');
  const resultEl = document.getElementById('backend-result');

  const serverUrl = document.getElementById('serverUrl').value.trim();
  const pluginKey = document.getElementById('pluginKey').value.trim();

  if (!serverUrl || !pluginKey) {
    resultEl.className = 'test-result error';
    resultEl.textContent = '请先填写服务器地址和插件密钥';
    return;
  }

  btn.classList.add('loading');
  resultEl.className = 'test-result';
  resultEl.textContent = '正在验证后端连接...';

  chrome.storage.local.set({ backendConfig: { serverUrl, pluginKey } });
  await new Promise(r => setTimeout(r, 200));

  chrome.runtime.sendMessage({ action: 'VERIFY_KEY' }, (response) => {
    btn.classList.remove('loading');

    if (chrome.runtime.lastError) {
      resultEl.className = 'test-result error';
      resultEl.textContent = '测试失败: ' + chrome.runtime.lastError.message;
      return;
    }

    if (response && response.success) {
      resultEl.className = 'test-result success';
      resultEl.textContent = '后端连接成功，密钥验证通过！AI 智能填充已就绪。';
    } else {
      resultEl.className = 'test-result error';
      resultEl.textContent = '验证失败: ' + (response?.error || response?.message || '未知错误');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();

  document.getElementById('btn-toggle-key').addEventListener('click', () => {
    const input = document.getElementById('pluginKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('btn-save').addEventListener('click', saveConfig);
  document.getElementById('btn-test-backend').addEventListener('click', testBackend);
});
