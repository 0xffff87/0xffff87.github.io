/**
 * 简历投递助手 - 在线简历编辑器
 * 独立网页版，与 Chrome 插件通过 JSON 文件进行数据交换
 */

// ========== 工具函数 ==========

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const STORAGE_KEY = 'resumeHelperData';

function autoSave() {
  try {
    const data = collectAllData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* 静默失败 */ }
}

let saveTimer = null;
function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, 1500);
}

// ========== 动态条目模板 ==========

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function createEducationCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">&times;</button>
    <div class="form-grid-2">
      <div class="fg"><label>学校名称</label><input type="text" class="edu-school" value="${escapeHtml(data.school)}" placeholder="请输入学校名称"></div>
      <div class="fg"><label>学历</label>
        <select class="edu-degree">
          <option value="">请选择</option>
          ${['博士','硕士','本科','大专','高中'].map(d => `<option value="${d}" ${data.degree===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-grid-2">
      <div class="fg"><label>专业</label><input type="text" class="edu-major" value="${escapeHtml(data.major)}" placeholder="请输入专业"></div>
      <div class="fg"><label>GPA / 排名</label><input type="text" class="edu-gpa" value="${escapeHtml(data.gpa)}" placeholder="如：3.8/4.0"></div>
    </div>
    <div class="form-grid-2">
      <div class="fg"><label>入学时间</label><input type="month" class="edu-start" value="${data.startDate || ''}"></div>
      <div class="fg"><label>毕业时间</label><input type="month" class="edu-end" value="${data.endDate || ''}"></div>
    </div>
    <div class="fg"><label>主要课程及成绩（选填）</label><textarea class="edu-courses" rows="2" placeholder="如：数据结构(95) 算法设计(90)">${escapeHtml(data.courses)}</textarea></div>
    <div class="fg"><label>在校经历（选填）</label><textarea class="edu-desc" rows="2" placeholder="社团活动、学生干部等">${escapeHtml(data.description)}</textarea></div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => { card.remove(); scheduleAutoSave(); });
  card.addEventListener('input', scheduleAutoSave);
  return card;
}

function createExperienceCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">&times;</button>
    <div class="form-grid-2">
      <div class="fg"><label>公司 / 单位名称</label><input type="text" class="exp-company" value="${escapeHtml(data.company)}" placeholder="请输入公司名称"></div>
      <div class="fg"><label>职位</label><input type="text" class="exp-position" value="${escapeHtml(data.position)}" placeholder="请输入职位名称"></div>
    </div>
    <div class="form-grid-2">
      <div class="fg"><label>开始时间</label><input type="month" class="exp-start" value="${data.startDate || ''}"></div>
      <div class="fg"><label>结束时间</label><input type="month" class="exp-end" value="${data.endDate || ''}"></div>
    </div>
    <div class="fg"><label>工作描述</label><textarea class="exp-desc" rows="3" placeholder="描述主要工作内容、业绩成果等">${escapeHtml(data.description)}</textarea></div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => { card.remove(); scheduleAutoSave(); });
  card.addEventListener('input', scheduleAutoSave);
  return card;
}

function createProjectCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">&times;</button>
    <div class="form-grid-2">
      <div class="fg"><label>项目名称</label><input type="text" class="proj-name" value="${escapeHtml(data.name)}" placeholder="请输入项目名称"></div>
      <div class="fg"><label>担任角色</label><input type="text" class="proj-role" value="${escapeHtml(data.role)}" placeholder="如：项目负责人"></div>
    </div>
    <div class="form-grid-2">
      <div class="fg"><label>开始时间</label><input type="month" class="proj-start" value="${data.startDate || ''}"></div>
      <div class="fg"><label>结束时间</label><input type="month" class="proj-end" value="${data.endDate || ''}"></div>
    </div>
    <div class="fg"><label>技术栈</label><input type="text" class="proj-tech" value="${escapeHtml(data.techStack)}" placeholder="如：Python, PyTorch, React"></div>
    <div class="fg"><label>项目描述</label><textarea class="proj-desc" rows="3" placeholder="描述项目背景、你的职责和成果">${escapeHtml(data.description)}</textarea></div>
    <div class="fg"><label>项目链接（选填）</label><input type="text" class="proj-link" value="${escapeHtml(data.link)}" placeholder="如：GitHub地址"></div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => { card.remove(); scheduleAutoSave(); });
  card.addEventListener('input', scheduleAutoSave);
  return card;
}

function createAwardCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">&times;</button>
    <div class="form-grid-2">
      <div class="fg"><label>奖项名称</label><input type="text" class="award-name" value="${escapeHtml(data.name)}" placeholder="如：国家奖学金"></div>
      <div class="fg"><label>级别</label>
        <select class="award-level">
          <option value="">请选择</option>
          ${['国家级','省级','市级','校级','院级','其他'].map(l => `<option value="${l}" ${data.level===l?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-grid-2">
      <div class="fg"><label>获奖时间</label><input type="month" class="award-date" value="${data.date || ''}"></div>
      <div class="fg"><label>描述（选填）</label><input type="text" class="award-desc" value="${escapeHtml(data.description)}" placeholder="简要描述"></div>
    </div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => { card.remove(); scheduleAutoSave(); });
  card.addEventListener('input', scheduleAutoSave);
  return card;
}

// ========== 数据收集 & 加载 ==========

const F = id => document.getElementById(id);

function collectAllData() {
  const data = {
    basic: {
      name: F('f-name').value,
      gender: F('f-gender').value,
      birthday: F('f-birthday').value,
      phone: F('f-phone').value,
      email: F('f-email').value,
      ethnicity: F('f-ethnicity').value,
      political: F('f-political').value,
      hometown: F('f-hometown').value,
      address: F('f-address').value,
      idcard: F('f-idcard').value,
      currentCountry: F('f-currentCountry').value,
      currentCity: F('f-currentCity').value,
      targetCountry: F('f-targetCountry').value,
      targetCity: F('f-targetCity').value,
      targetPosition: F('f-targetPosition').value,
      expectedSalary: F('f-expectedSalary').value,
      summary: F('f-summary').value,
    },
    education: [],
    experience: [],
    projects: [],
    awards: [],
    skills: F('f-skills').value,
    courses: F('f-courses').value,
    certificates: F('f-certificates').value,
    languages: F('f-languages').value,
    hobbies: F('f-hobbies').value,
  };

  document.querySelectorAll('#edu-list .entry-card').forEach(card => {
    data.education.push({
      id: card.dataset.id,
      school: card.querySelector('.edu-school').value,
      degree: card.querySelector('.edu-degree').value,
      major: card.querySelector('.edu-major').value,
      startDate: card.querySelector('.edu-start').value,
      endDate: card.querySelector('.edu-end').value,
      gpa: card.querySelector('.edu-gpa').value,
      courses: card.querySelector('.edu-courses').value,
      description: card.querySelector('.edu-desc').value,
    });
  });

  document.querySelectorAll('#exp-list .entry-card').forEach(card => {
    data.experience.push({
      id: card.dataset.id,
      company: card.querySelector('.exp-company').value,
      position: card.querySelector('.exp-position').value,
      startDate: card.querySelector('.exp-start').value,
      endDate: card.querySelector('.exp-end').value,
      description: card.querySelector('.exp-desc').value,
    });
  });

  document.querySelectorAll('#proj-list .entry-card').forEach(card => {
    data.projects.push({
      id: card.dataset.id,
      name: card.querySelector('.proj-name').value,
      role: card.querySelector('.proj-role').value,
      startDate: card.querySelector('.proj-start').value,
      endDate: card.querySelector('.proj-end').value,
      techStack: card.querySelector('.proj-tech').value,
      description: card.querySelector('.proj-desc').value,
      link: card.querySelector('.proj-link').value,
    });
  });

  document.querySelectorAll('#award-list .entry-card').forEach(card => {
    data.awards.push({
      id: card.dataset.id,
      name: card.querySelector('.award-name').value,
      date: card.querySelector('.award-date').value,
      level: card.querySelector('.award-level').value,
      description: card.querySelector('.award-desc').value,
    });
  });

  return data;
}

function loadData(data) {
  if (!data) return;

  if (data.basic) {
    const b = data.basic;
    F('f-name').value = b.name || '';
    F('f-gender').value = b.gender || '';
    F('f-birthday').value = b.birthday || '';
    F('f-phone').value = b.phone || '';
    F('f-email').value = b.email || '';
    F('f-ethnicity').value = b.ethnicity || '';
    F('f-political').value = b.political || '';
    F('f-hometown').value = b.hometown || '';
    F('f-address').value = b.address || '';
    F('f-idcard').value = b.idcard || '';
    F('f-currentCountry').value = b.currentCountry || '';
    F('f-currentCity').value = b.currentCity || '';
    F('f-targetCountry').value = b.targetCountry || '';
    F('f-targetCity').value = b.targetCity || '';
    F('f-targetPosition').value = b.targetPosition || '';
    F('f-expectedSalary').value = b.expectedSalary || '';
    F('f-summary').value = b.summary || '';
  }

  const eduList = F('edu-list');
  eduList.innerHTML = '';
  (data.education || []).forEach(edu => eduList.appendChild(createEducationCard(edu)));

  const expList = F('exp-list');
  expList.innerHTML = '';
  (data.experience || []).forEach(exp => expList.appendChild(createExperienceCard(exp)));

  const projList = F('proj-list');
  projList.innerHTML = '';
  (data.projects || []).forEach(proj => projList.appendChild(createProjectCard(proj)));

  const awardList = F('award-list');
  awardList.innerHTML = '';
  (data.awards || []).forEach(award => awardList.appendChild(createAwardCard(award)));

  F('f-skills').value = data.skills || '';
  F('f-courses').value = data.courses || '';
  F('f-certificates').value = data.certificates || '';
  F('f-languages').value = data.languages || '';
  F('f-hobbies').value = data.hobbies || '';
}

// ========== 导出 ==========

function exportData() {
  const data = collectAllData();
  if (!data.basic.name) {
    showToast('请至少填写姓名后再导出', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `简历数据_${data.basic.name}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('简历数据已导出为 JSON 文件', 'success');
}

// ========== 示例数据 ==========

function getSampleData() {
  return {
    basic: {
      name: '张明远', gender: '男', birthday: '2000-06-15',
      phone: '13800138000', email: 'zhangmingyuan@example.com',
      ethnicity: '汉族', political: '共青团员',
      hometown: '山东省济南市', address: '山东省济南市历下区经十路88号',
      idcard: '370102200006150012',
      currentCountry: '中国', currentCity: '济南',
      targetCountry: '中国', targetCity: '北京、上海、杭州',
      targetPosition: '后端开发工程师', expectedSalary: '18k-30k',
      summary: '计算机科学与技术专业应届硕士毕业生，具备扎实的编程基础和丰富的项目实践经验。期望从事后端开发或 AI 相关岗位。',
    },
    education: [
      { school: '山东大学', degree: '硕士', major: '计算机科学与技术',
        startDate: '2023-09', endDate: '2026-06', gpa: '3.7/4.0',
        courses: '高级算法设计(92) 机器学习(95) 自然语言处理(93)',
        description: '研究方向：自然语言处理。参与导师科研项目2项。' },
    ],
    experience: [
      { company: '字节跳动', position: '后端开发实习生',
        startDate: '2025-06', endDate: '2025-09',
        description: '参与内容推荐系统后端服务开发，负责推荐算法接口优化和性能调优。' },
    ],
    projects: [
      { name: '智能简历填写助手', role: '项目负责人',
        startDate: '2025-03', endDate: '2025-12',
        techStack: 'JavaScript, Chrome Extension, AI API',
        description: '基于浏览器插件和 AI 技术，开发智能简历自动填写工具。',
        link: 'https://github.com/example/resume-helper' },
    ],
    awards: [
      { name: '校级优秀学生', date: '2024-06', level: '校级', description: '' },
    ],
    skills: '编程语言：Python、Java、Go、JavaScript\n框架：Spring Boot、Django、PyTorch',
    courses: '数据结构(95) 算法设计与分析(90) 操作系统(88)',
    certificates: 'CET-6 560分\n计算机技术与软件专业技术资格（软件设计师）',
    languages: '普通话（母语）\n英语（CET-6 560分）',
    hobbies: '篮球、技术博客写作、开源项目贡献',
  };
}

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', () => {
  // 移动端导航菜单
  const toggle = F('navbar-toggle');
  const links = document.querySelector('.navbar-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // 表单区块折叠
  document.querySelectorAll('.form-section-title').forEach(title => {
    title.addEventListener('click', () => {
      title.closest('.form-section').classList.toggle('collapsed');
    });
  });

  // 添加条目
  F('btn-add-edu').addEventListener('click', () => {
    F('edu-list').appendChild(createEducationCard());
    scheduleAutoSave();
  });
  F('btn-add-exp').addEventListener('click', () => {
    F('exp-list').appendChild(createExperienceCard());
    scheduleAutoSave();
  });
  F('btn-add-proj').addEventListener('click', () => {
    F('proj-list').appendChild(createProjectCard());
    scheduleAutoSave();
  });
  F('btn-add-award').addEventListener('click', () => {
    F('award-list').appendChild(createAwardCard());
    scheduleAutoSave();
  });

  // 导出
  F('btn-export').addEventListener('click', exportData);
  F('btn-export-bottom').addEventListener('click', exportData);

  // 导入
  F('btn-import').addEventListener('click', () => F('import-file').click());
  F('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.basic || !data.basic.name) {
          showToast('文件格式不正确，缺少基本信息', 'error');
          return;
        }
        loadData(data);
        autoSave();
        showToast('简历数据已导入', 'success');
      } catch (err) {
        showToast('文件解析失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 加载示例
  F('btn-load-demo').addEventListener('click', () => {
    loadData(getSampleData());
    autoSave();
    showToast('示例数据已加载', 'success');
  });

  // 清空
  F('btn-clear').addEventListener('click', () => {
    if (!confirm('确定要清空所有已填写的简历数据吗？此操作不可恢复。')) return;
    loadData({ basic: {}, education: [], experience: [], projects: [], awards: [],
      skills: '', courses: '', certificates: '', languages: '', hobbies: '' });
    localStorage.removeItem(STORAGE_KEY);
    showToast('数据已清空', 'info');
  });

  // 自动保存监听
  document.querySelectorAll('.editor-main input, .editor-main select, .editor-main textarea').forEach(el => {
    el.addEventListener('input', scheduleAutoSave);
    el.addEventListener('change', scheduleAutoSave);
  });

  // 加载已保存数据
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      loadData(JSON.parse(saved));
    }
  } catch (e) { /* 首次访问无数据 */ }

  // 安装按钮（跳转Chrome Web Store，用户需替换为实际链接）
  const installHandler = (e) => {
    e.preventDefault();
    showToast('请在 Chrome 网上应用店搜索「简历投递助手」安装', 'info');
  };
  const btnInstall = F('btn-install');
  const btnInstallHero = F('btn-install-hero');
  if (btnInstall) btnInstall.addEventListener('click', installHandler);
  if (btnInstallHero) btnInstallHero.addEventListener('click', installHandler);
});
