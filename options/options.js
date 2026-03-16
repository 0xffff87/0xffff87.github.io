/**
 * 简历投递助手 - 选项页逻辑
 * 管理后端服务和 AI 服务配置
 */

// AI 服务商预设配置
const AI_PROVIDERS = {
  siliconflow: {
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'Qwen/Qwen2.5-VL-72B-Instruct',
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  },
  zhipu: {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4v-flash',
  },
  moonshot: {
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
  custom: {
    endpoint: '',
    model: '',
  },
};

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

// 加载配置
function loadConfig() {
  chrome.storage.local.get(['backendConfig', 'aiConfig'], (result) => {
    const bc = result.backendConfig || {};
    document.getElementById('serverUrl').value = bc.serverUrl || '';
    document.getElementById('pluginKey').value = bc.pluginKey || '';

    const ai = result.aiConfig || {};
    document.getElementById('aiEndpoint').value = ai.endpoint || 'https://api.siliconflow.cn/v1/chat/completions';
    document.getElementById('aiApiKey').value = ai.apiKey || '';
    document.getElementById('aiModel').value = ai.model || 'Qwen/Qwen2.5-VL-72B-Instruct';

    // 自动选中匹配的服务商
    const selectedProvider = ai.provider || detectProvider(ai.endpoint || '');
    const radio = document.querySelector(`input[name="aiProvider"][value="${selectedProvider}"]`);
    if (radio) radio.checked = true;
  });
}

// 根据 endpoint 自动检测服务商
function detectProvider(endpoint) {
  if (endpoint.includes('siliconflow')) return 'siliconflow';
  if (endpoint.includes('deepseek')) return 'deepseek';
  if (endpoint.includes('bigmodel.cn')) return 'zhipu';
  if (endpoint.includes('moonshot')) return 'moonshot';
  if (endpoint.includes('openai.com')) return 'openai';
  return 'custom';
}

// 保存配置
function saveConfig() {
  const backendConfig = {
    serverUrl: document.getElementById('serverUrl').value.trim(),
    pluginKey: document.getElementById('pluginKey').value.trim(),
  };

  const selectedProvider = document.querySelector('input[name="aiProvider"]:checked');
  const aiConfig = {
    provider: selectedProvider ? selectedProvider.value : 'custom',
    endpoint: document.getElementById('aiEndpoint').value.trim(),
    apiKey: document.getElementById('aiApiKey').value.trim(),
    model: document.getElementById('aiModel').value.trim(),
  };

  if (!aiConfig.endpoint) {
    showToast('请填写 AI API 地址', 'error');
    return;
  }

  if (!aiConfig.apiKey) {
    showToast('请填写 AI API Key', 'error');
    return;
  }

  chrome.storage.local.set({ backendConfig, aiConfig }, () => {
    chrome.runtime.sendMessage({ action: 'SAVE_AI_CONFIG', config: aiConfig });
    showToast('设置已保存', 'success');
  });
}

// 测试后端连接
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

  // 先保存再测试
  chrome.storage.local.set({
    backendConfig: { serverUrl, pluginKey }
  });
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
      resultEl.textContent = '后端连接成功，密钥验证通过！';
    } else {
      resultEl.className = 'test-result error';
      resultEl.textContent = '验证失败: ' + (response?.error || response?.message || '未知错误');
    }
  });
}

// 测试 AI 连接
async function testAI() {
  const btn = document.getElementById('btn-test-ai');
  const resultEl = document.getElementById('ai-result');

  const endpoint = document.getElementById('aiEndpoint').value.trim();
  const apiKey = document.getElementById('aiApiKey').value.trim();
  const model = document.getElementById('aiModel').value.trim();

  if (!endpoint || !apiKey) {
    resultEl.className = 'test-result error';
    resultEl.textContent = '请先填写 API 地址和 API Key';
    return;
  }

  btn.classList.add('loading');
  resultEl.className = 'test-result';
  resultEl.textContent = '正在测试 AI 连接...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: '请回复"OK"' }],
        max_tokens: 10,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      resultEl.className = 'test-result success';
      resultEl.textContent = `AI 连接成功！模型回复: "${content.substring(0, 50)}"`;
    } else {
      const errText = await response.text().catch(() => '');
      resultEl.className = 'test-result error';
      resultEl.textContent = `AI 接口错误 (${response.status}): ${errText.substring(0, 100)}`;
    }
  } catch (e) {
    btn.classList.remove('loading');
    resultEl.className = 'test-result error';
    if (e.name === 'AbortError') {
      resultEl.textContent = 'AI 连接超时（30秒）';
    } else {
      resultEl.textContent = '测试失败: ' + e.message;
    }
    return;
  }
  btn.classList.remove('loading');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();

  // 密码可见切换 - 后端密钥
  document.getElementById('btn-toggle-key').addEventListener('click', () => {
    const input = document.getElementById('pluginKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // 密码可见切换 - AI Key
  document.getElementById('btn-toggle-ai-key').addEventListener('click', () => {
    const input = document.getElementById('aiApiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // AI 服务商选择
  document.querySelectorAll('input[name="aiProvider"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const provider = radio.value;
      const preset = AI_PROVIDERS[provider];
      if (preset && preset.endpoint) {
        document.getElementById('aiEndpoint').value = preset.endpoint;
        document.getElementById('aiModel').value = preset.model;
      }
    });
  });

  document.getElementById('btn-save').addEventListener('click', saveConfig);
  document.getElementById('btn-test-backend').addEventListener('click', testBackend);
  document.getElementById('btn-test-ai').addEventListener('click', testAI);
});
