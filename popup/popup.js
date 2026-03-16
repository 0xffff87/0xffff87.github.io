/**
 * 简历投递助手 - Popup 控制面板
 * 提供一键填写、在线编辑跳转、数据导入导出功能
 * 个人信息编辑统一在在线编辑器中完成
 */

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function updateStatus(resumeData) {
  const titleEl = document.getElementById('status-title');
  const descEl = document.getElementById('status-desc');
  const iconEl = document.getElementById('status-icon');

  if (resumeData && resumeData.basic && resumeData.basic.name) {
    const name = resumeData.basic.name;
    const eduCount = (resumeData.education || []).length;
    const expCount = (resumeData.experience || []).length;
    titleEl.textContent = `${name} 的简历已加载`;
    descEl.textContent = `教育${eduCount}段 · 工作${expCount}段`;
    iconEl.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52c41a" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>`;
  } else {
    titleEl.textContent = '未加载简历数据';
    descEl.textContent = '请在线编辑简历或导入 JSON 文件';
    iconEl.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>`;
  }
}

function getSampleData() {
  return {
    basic: {
      name: '张明远', gender: '男', birthday: '2000-06-15',
      phone: '13800138000', email: 'zhangmingyuan@example.com',
      ethnicity: '汉族', political: '共青团员',
      hometown: '山东省济南市', address: '山东省济南市历下区经十路88号',
      idcard: '370102200006150012', currentCountry: '中国', currentCity: '济南',
      targetCountry: '中国', targetCity: '北京、上海、杭州',
      targetPosition: '后端开发工程师', expectedSalary: '18k-30k',
      workExperience: '无工作经验',
      summary: '计算机科学与技术专业应届硕士毕业生，具备扎实的编程基础和丰富的项目实践经验。',
    },
    education: [{
      school: '山东大学', degree: '硕士', major: '计算机科学与技术',
      startDate: '2023-09', endDate: '2026-06', gpa: '3.7/4.0',
    }],
    experience: [{
      company: '字节跳动', position: '后端开发实习生',
      startDate: '2025-06', endDate: '2025-09',
      description: '参与内容推荐系统后端服务开发。',
    }],
    projects: [{
      name: '智能简历解析系统', role: '项目负责人',
      startDate: '2025-03', endDate: '2025-12',
      techStack: 'Python, PyTorch, FastAPI',
      description: '基于大语言模型的简历智能解析系统。',
    }],
    awards: [{ name: '数学建模竞赛二等奖', date: '2024-11', level: '国家级' }],
    skills: 'Python、Java、Go、Spring Boot、Docker',
    languages: '普通话（母语）\n英语（CET-6 560分）',
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // 加载状态
  chrome.storage.local.get('resumeData', (result) => {
    updateStatus(result.resumeData);
  });

  // 设置按钮
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 在线编辑
  document.getElementById('btn-online').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://0xffff87.github.io/website/' });
  });

  // 一键填写
  document.getElementById('btn-fill').addEventListener('click', async () => {
    const result = await chrome.storage.local.get('resumeData');
    const data = result.resumeData;
    if (!data || !data.basic || !data.basic.name) {
      showToast('请先在线编辑并保存简历数据', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { showToast('无法获取当前标签页', 'error'); return; }
      showToast('正在分析页面表单...', 'info');
      chrome.tabs.sendMessage(tab.id, { action: 'START_FILL', resumeData: data }, (resp) => {
        if (chrome.runtime.lastError) { showToast('请刷新页面后重试', 'error'); return; }
        if (resp && resp.success) showToast('填写完成！请检查结果', 'success');
        else showToast(resp?.message || '填写失败，请重试', 'error');
      });
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
  });

  // 示例数据
  document.getElementById('btn-demo').addEventListener('click', () => {
    const data = getSampleData();
    chrome.storage.local.set({ resumeData: data }, () => {
      updateStatus(data);
      showToast('示例数据已加载', 'success');
    });
  });

  // 导出
  document.getElementById('btn-export').addEventListener('click', async () => {
    const result = await chrome.storage.local.get('resumeData');
    const data = result.resumeData;
    if (!data || !data.basic || !data.basic.name) {
      showToast('没有可导出的数据', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简历数据_${data.basic.name}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('简历数据已导出', 'success');
  });

  // 导入
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.basic || !data.basic.name) {
          showToast('文件格式不正确', 'error');
          return;
        }
        chrome.storage.local.set({ resumeData: data }, () => {
          updateStatus(data);
          showToast('简历数据已导入', 'success');
        });
      } catch (err) {
        showToast('文件解析失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
});
