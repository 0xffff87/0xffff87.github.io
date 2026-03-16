"""
简历投递助手 - 后端服务
提供插件授权验证、日志收集、表单智能填写（规则匹配+AI调用）
"""

import json
import os
import re
import time
import sqlite3
import hashlib
import secrets
import traceback
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests as http_requests

app = Flask(__name__)
CORS(app)

DATA_DIR = '/opt/resume-backend/data'
LOG_DIR = os.path.join(DATA_DIR, 'logs')
KEY_FILE = os.path.join(DATA_DIR, 'keys.json')
AI_CONFIG_FILE = os.path.join(DATA_DIR, 'ai_config.json')
DB_FILE = os.path.join(DATA_DIR, 'resume_helper.db')

os.makedirs(LOG_DIR, exist_ok=True)

# ========== AI 配置 ==========

DEFAULT_AI_CONFIG = {
    'apiUrl': 'https://aigw-jnzs5.cucloud.cn:8443/v1/chat/completions',
    'apiKey': 'sk-sp-IE2R9jUBm2jDTIdoWoQrcCQeAVpim6iq',
    'model': 'MiniMax-M2.5',
    'maxTokens': 16384,
    'temperature': 0,
}

FORM_FILL_SYSTEM_PROMPT = (
    '你是表单自动填写工具。直接输出JSON，不需要思考。\n'
    '输入含fields和resume。输出：{"fills":[{"fieldId":"f_0","value":"值"}]}\n'
    '要求：select/dropdown用选项文本；年份填数字如2023；月份填01-12；区号+86；无法判断填""。\n'
    '只输出JSON，不要<think>标签。'
)


def load_ai_config():
    if os.path.exists(AI_CONFIG_FILE):
        with open(AI_CONFIG_FILE, 'r') as f:
            saved = json.load(f)
            return {**DEFAULT_AI_CONFIG, **saved}
    return dict(DEFAULT_AI_CONFIG)


def save_ai_config(config):
    with open(AI_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def ensure_full_api_url(url):
    if not url:
        return url
    url = url.rstrip('/')
    if not url.endswith('/chat/completions'):
        if not url.endswith('/v1'):
            url += '/v1'
        url += '/chat/completions'
    return url


# ========== 数据库密钥管理（SQLite） ==========

def get_db():
    """获取 SQLite 数据库连接"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化数据库表结构，并从旧 JSON 迁移数据"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        name TEXT DEFAULT 'unnamed',
        created TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        last_used TEXT,
        usage_count INTEGER DEFAULT 0
    )''')
    conn.commit()

    # 从旧 keys.json 迁移到 SQLite
    if os.path.exists(KEY_FILE):
        try:
            with open(KEY_FILE, 'r') as f:
                old_keys = json.load(f)
            for k, v in old_keys.items():
                c.execute(
                    'INSERT OR IGNORE INTO api_keys (key, name, created, active) VALUES (?, ?, ?, ?)',
                    (k, v.get('name', 'unnamed'), v.get('created', datetime.now().isoformat()),
                     1 if v.get('active') else 0)
                )
            conn.commit()
            backup = KEY_FILE + '.migrated'
            os.rename(KEY_FILE, backup)
            print(f'[迁移] 已将 {len(old_keys)} 个密钥从 JSON 迁移到 SQLite，旧文件备份为 {backup}')
        except Exception as e:
            print(f'[迁移] JSON 迁移失败: {e}')
    conn.close()


def init_default_key():
    """确保至少存在一个有效密钥"""
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT key FROM api_keys WHERE active = 1 LIMIT 1')
    row = c.fetchone()
    if row:
        print(f'[启动] 当前有效密钥: {row["key"]}')
    else:
        default_key = 'rh-' + secrets.token_hex(16)
        c.execute(
            'INSERT INTO api_keys (key, name, created, active) VALUES (?, ?, ?, 1)',
            (default_key, 'default', datetime.now().isoformat())
        )
        conn.commit()
        print(f'[初始化] 默认密钥已生成: {default_key}')
    conn.close()


def verify_key(key):
    """验证密钥有效性，并更新使用记录"""
    if not key:
        return False
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT active FROM api_keys WHERE key = ?', (key,))
    row = c.fetchone()
    if row and row['active']:
        c.execute(
            'UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE key = ?',
            (datetime.now().isoformat(), key)
        )
        conn.commit()
        conn.close()
        return True
    conn.close()
    return False


def load_keys():
    """从数据库加载所有密钥（兼容旧接口）"""
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT key, name, created, active, last_used, usage_count FROM api_keys')
    keys = {}
    for row in c.fetchall():
        keys[row['key']] = {
            'name': row['name'],
            'created': row['created'],
            'active': bool(row['active']),
            'last_used': row['last_used'],
            'usage_count': row['usage_count'],
        }
    conn.close()
    return keys


def create_key_in_db(name='unnamed'):
    """在数据库中创建新密钥"""
    new_key = 'rh-' + secrets.token_hex(16)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        'INSERT INTO api_keys (key, name, created, active) VALUES (?, ?, ?, 1)',
        (new_key, name, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return new_key


def deactivate_key_in_db(key):
    """停用指定密钥"""
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE api_keys SET active = 0 WHERE key = ?', (key,))
    affected = c.rowcount
    conn.commit()
    conn.close()
    return affected > 0


# ========== 日志存储 ==========

def save_log(client_id, log_data):
    date_str = datetime.now().strftime('%Y-%m-%d')
    log_file = os.path.join(LOG_DIR, f'{date_str}.jsonl')
    entry = {
        'timestamp': datetime.now().isoformat(),
        'client_id': client_id,
        'url': log_data.get('url', ''),
        'title': log_data.get('title', ''),
        'logs': log_data.get('logs', []),
        'fields_count': log_data.get('fieldsCount', 0),
        'filled_count': log_data.get('filledCount', 0),
        'failed_count': log_data.get('failedCount', 0),
    }
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    return entry


def read_logs(date=None, limit=50):
    if date:
        log_file = os.path.join(LOG_DIR, f'{date}.jsonl')
        if not os.path.exists(log_file):
            return []
        with open(log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        return [json.loads(line) for line in lines[-limit:]]
    else:
        log_files = sorted(
            [f for f in os.listdir(LOG_DIR) if f.endswith('.jsonl')],
            reverse=True
        )
        results = []
        for lf in log_files[:3]:
            with open(os.path.join(LOG_DIR, lf), 'r', encoding='utf-8') as f:
                lines = f.readlines()
            results.extend([json.loads(line) for line in lines])
            if len(results) >= limit:
                break
        return results[-limit:]


# ========== 规则匹配引擎 ==========

def is_date_related_field(field):
    cls = (field.get('className') or '').lower()
    return bool(re.search(r'required-year|required-month|year|month|date-?picker|calendar', cls, re.I))


def test_field_attr(field, label_re, name_re, class_re, debug_idx=None):
    if label_re:
        for attr in ('label', 'placeholder', 'ariaLabel'):
            val = field.get(attr) or ''
            if val and re.search(label_re, val, re.I):
                return True
    if name_re:
        for attr in ('name', 'id'):
            val = field.get(attr) or ''
            if val and re.search(name_re, val, re.I):
                return True
            if debug_idx == 1 and name_re and val:
                print(f"    [DEBUG-1] test name_re={name_re!r} against {attr}={val!r} => {bool(re.search(name_re, val, re.I))}", flush=True)
    if class_re:
        val = field.get('className') or ''
        if val and re.search(class_re, val, re.I):
            return True
    return False


def search_parent_text(field, keywords):
    """通过字段的context和nearby文本搜索关键词"""
    if not keywords:
        return False
    ctx = (field.get('context') or '') + ' ' + (field.get('nearby') or '') + ' ' + (field.get('parentText') or '')
    for kw in keywords:
        if kw in ctx:
            return True
    return False


def rule_match(fields, resume_data):
    matched = {}
    basic = resume_data.get('basic') or {}
    edu_list = resume_data.get('education') or []
    edu = edu_list[0] if edu_list else {}
    work_list = resume_data.get('work') or resume_data.get('experience') or []
    work = work_list[0] if work_list else {}
    # 调试信息
    print(f"  [DEBUG] basic keys: {list(basic.keys())}", flush=True)
    print(f"  [DEBUG] idCard value: {basic.get('idCard')}", flush=True)
    print(f"  [DEBUG] work keys: {list(work.keys())}", flush=True)
    # 打印所有字段的详细信息
    for i, f in enumerate(fields):
        print(f"  [DEBUG] field[{i}] label={f.get('label')!r} parent={f.get('parentText')!r} name={f.get('name')!r} section={f.get('section')!r} context={f.get('context')!r} nearby={f.get('nearby')!r}", flush=True)
    proj_list = resume_data.get('projects') or []
    proj = proj_list[0] if proj_list else {}

    rules = [
        {'label_re': r'^(?:姓名|真实姓名|请输入真实姓名|请输入姓名|名字)$', 'name_re': r'^name$',
         'parent_kw': ['姓名', '名字', '真实姓名'], 'value': basic.get('name'), 'unique': True, 'key': 'name'},
        {'label_re': r'^(?:区号)$', 'class_re': r'telephone-region', 'parent_kw': ['区号'], 'value': '+86', 'unique': True, 'key': 'areaCode'},
        {'label_re': r'(?:手机|电话|联系方式|手机号|请输入.*手机号)', 'name_re': r'^(?:phone|mobile|tel|cellphone)$', 'class_re': r'telephone-input|phone-input',
         'parent_kw': ['手机', '电话', '联系方式', '手机号码'], 'value': basic.get('phone'), 'unique': True, 'key': 'phone'},
        {'label_re': r'(?:邮箱|邮件|电子邮箱|请.*邮箱)', 'name_re': r'^(?:e-?mail|email)$', 'class_re': r'e-?mail-input',
         'parent_kw': ['邮箱', '邮件', '电子邮箱'], 'value': basic.get('email'), 'unique': True, 'key': 'email'},
        {'label_re': r'^(?:性别)$', 'name_re': r'^(?:gender|sex)$',
         'parent_kw': ['性别'], 'value': basic.get('gender'), 'unique': True, 'key': 'gender'},
        {'label_re': r'(?:工作经验|工作年限)', 'parent_kw': ['工作经验', '工作年限'],
         'value': basic.get('workExperience', '无工作经验'), 'unique': True, 'key': 'workExperience', 'only_select': True},
        {'label_re': r'(?:出生|生日|birthday)', 'name_re': r'(?:birth)',
         'parent_kw': ['出生', '生日'], 'value': basic.get('birthday'), 'unique': True, 'key': 'birthday'},
        {'label_re': r'^(?:身份证|证件类型)$', 'parent_kw': ['证件类型', '证件名称'],
         'value': '身份证', 'unique': True, 'key': 'certType', 'only_select': True},
        {'label_re': r'(?:证件号码|身份证号)', 'name_re': r'(?:cardnum|idcard|idnumber)',
         'parent_kw': ['证件号码', '身份证号'], 'value': basic.get('idCard') or basic.get('idNumber') or basic.get('idcard'), 'unique': True, 'key': 'idNumber', 'skip_dropdown': True},
        {'label_re': r'(?:政治面貌)', 'parent_kw': ['政治面貌', '面貌'], 'value': basic.get('politicalStatus') or basic.get('political'), 'unique': True, 'key': 'political'},
        {'label_re': r'(?:民族|族别)', 'parent_kw': ['民族'], 'value': basic.get('ethnicity'), 'unique': True, 'key': 'ethnicity'},
        {'label_re': r'(?:籍贯|户口)', 'parent_kw': ['籍贯', '户口'], 'value': basic.get('hometown'), 'unique': True, 'key': 'hometown'},
        {'label_re': r'(?:通信地址|住址|通讯地址|地址)', 'parent_kw': ['通信地址', '地址', '住址'], 'value': basic.get('address'), 'unique': True, 'key': 'address'},
        {'label_re': r'(?:选择国家|当前居住国家|居住国家)', 'class_re': r'country-input(?!.*expectWork)',
         'parent_kw': ['当前居住国家', '居住国家'], 'value': basic.get('currentCountry') or '中国', 'unique': True, 'key': 'currentCountry'},
        {'label_re': r'(?:现居住|所在地|当前城市|居住城市|省/市)', 'parent_kw': ['现居住', '所在地', '当前城市', '当前居住省/市', '居住省/市'],
         'value': basic.get('currentCity'), 'unique': True, 'key': 'currentCity'},
        {'label_re': r'(?:最近公司|最近工作)', 'parent_kw': ['最近公司'],
         'value': work.get('company'), 'unique': True, 'key': 'recentCompany', 'skip_date': True},
        {'label_re': r'(?:期望工作国家|请选择国家)', 'class_re': r'expectWorkCountry',
         'parent_kw': ['期望工作国家'], 'value': '中国大陆', 'unique': True, 'key': 'expectCountry'},
        {'label_re': r'(?:意向.*城市|意愿.*城市|意向.*地点|目标.*城市|期望.*城市)', 'parent_kw': ['意向工作城市', '意愿城市', '意向地点', '期望工作城市', '期望城市'],
         'value': basic.get('targetCity'), 'unique': True, 'key': 'targetCity'},
        {'label_re': r'(?:当前薪资|目前薪资|现在薪资)', 'parent_kw': ['当前薪资', '目前薪资'],
         'value': basic.get('expectedSalary'), 'unique': True, 'key': 'currentSalary'},
        {'label_re': r'(?:期望.*薪|年薪|月薪|期望薪资)', 'parent_kw': ['期望年薪', '年薪', '月薪', '期望薪资'],
         'value': basic.get('expectedSalary'), 'unique': True, 'key': 'expectedSalary'},
        {'label_re': r'(?:自我评价|自我介绍|自我描述|补充信息|简介)', 'parent_kw': ['自我评价', '自我介绍', '自我描述', '补充信息', '自我描述'],
         'value': basic.get('summary') or resume_data.get('summary'), 'unique': True, 'key': 'summary'},
        {'label_re': r'(?:微信号|微信)', 'parent_kw': ['微信号', '微信'], 'value': basic.get('wechat'), 'unique': True, 'key': 'wechat'},
        {'label_re': r'^(?:学校|学校名称|请输入就读学校)$', 'name_re': r'^school$', 'class_re': r'school-input',
         'parent_kw': ['学校名称', '学校'], 'value': edu.get('school'), 'unique': False, 'key': 'school', 'skip_date': True},
        {'label_re': r'^(?:专业|专业名称|请输入专业名称)$', 'name_re': r'^major$',
         'parent_kw': ['专业名称', '专业'], 'value': edu.get('major'), 'unique': False, 'key': 'major', 'skip_date': True},
        {'label_re': r'^(?:学历|最高学历)$', 'name_re': r'^(?:degree|education)$', 'class_re': r'education-required|degree',
         'parent_kw': ['学历', '最高学历'], 'value': edu.get('degree'), 'unique': False, 'key': 'degree', 'skip_date': True, 'only_select': True},
        {'label_re': r'^(?:公司名称)$', 'name_re': r'^(?:company|companyName?\d*)$',
         'parent_kw': ['公司名称'], 'value': work.get('company'), 'unique': False, 'key': 'company', 'skip_date': True},
        {'name_re': r'^(?:department\d*)$',
         'parent_kw': ['实习部门', '部门', '工作部门'], 'value': work.get('department'), 'unique': False, 'key': 'department', 'skip_date': True},
        {'label_re': r'^(?:工作职位|岗位名称|职位名称)$', 'name_re': r'^(?:positionName\d*|work)$',
         'parent_kw': ['岗位名称', '工作岗位', '岗位', '职位名称', '工作职位'], 'value': work.get('position') or work.get('title'), 'unique': False, 'key': 'position', 'skip_date': True},
        {'name_re': r'^(?:workDesc\d*)$', 'class_re': r'describe-input',
         'parent_kw': ['工作职责', '实习工作内容', '实习内容', '工作内容', '工作描述'], 'value': work.get('description'), 'unique': False, 'key': 'workDesc', 'skip_date': True},
        {'label_re': r'^(?:项目名称)$', 'name_re': r'^(?:subjectName\d*)$',
         'parent_kw': ['项目名称'], 'value': proj.get('name'), 'unique': False, 'key': 'projectName', 'skip_date': True},
        {'label_re': r'^(?:职责)$', 'name_re': r'^(?:position\d+)$',
         'parent_kw': ['项目角色', '项目职位', '项目职责'], 'value': proj.get('role'), 'unique': False, 'key': 'projectPosition', 'skip_date': True},
        {'name_re': r'^(?:subjectDesc\d*)$',
         'parent_kw': ['项目描述', '项目内容'], 'value': proj.get('description'), 'unique': False, 'key': 'projectDesc', 'skip_date': True},
        {'label_re': r'^(?:项目中职责)$', 'name_re': r'^(?:positionDesc\d*)$',
         'parent_kw': ['项目中职责'], 'value': proj.get('role') or proj.get('description'), 'unique': False, 'key': 'projectRole', 'skip_date': True},
        {'name_re': r'^(?:portfolioAddress\d*)$', 'value': proj.get('link'), 'unique': False, 'key': 'portfolioLink', 'skip_date': True},
        {'label_re': r'(?:学号)', 'parent_kw': ['学号'], 'value': edu.get('studentId'), 'unique': True, 'key': 'studentId', 'skip_date': True},
        {'label_re': r'(?:导师|指导老师|指导教师)', 'parent_kw': ['导师', '指导老师', '指导教师'], 'value': edu.get('advisor'), 'unique': True, 'key': 'advisor', 'skip_date': True},
        {'label_re': r'(?:实验室)', 'parent_kw': ['实验室'], 'value': edu.get('lab'), 'unique': True, 'key': 'lab', 'skip_date': True},
        {'label_re': r'(?:研究方向|研究领域)', 'parent_kw': ['研究方向', '研究领域'], 'value': edu.get('researchDirection'), 'unique': True, 'key': 'researchDirection', 'skip_date': True},
        {'label_re': r'(?:GPA|绩点|成绩)', 'parent_kw': ['GPA', 'GPA成绩', '绩点'], 'value': edu.get('gpa'), 'unique': True, 'key': 'gpa', 'skip_date': True},
        {'label_re': r'(?:院系|学院|所在院)', 'parent_kw': ['院系', '学院', '所在院系', '所在院'], 'value': edu.get('department'), 'unique': True, 'key': 'department_edu', 'skip_date': True},
        {'label_re': r'(?:是否保送)', 'parent_kw': ['是否保送', '保送'], 'value': edu.get('isRecommended', '否'), 'unique': True, 'key': 'isRecommended', 'skip_date': True},
        {'label_re': r'(?:国家奖学金)', 'parent_kw': ['国家奖学金'], 'value': edu.get('nationalScholarship', '否'), 'unique': True, 'key': 'nationalScholarship', 'skip_date': True},
        {'label_re': r'(?:交换生|交换)', 'parent_kw': ['交换生', '是否为交换'], 'value': edu.get('isExchange', '否'), 'unique': True, 'key': 'isExchange', 'skip_date': True},
        {'label_re': r'(?:github|个人主页|个人网站)', 'parent_kw': ['Github', 'github', '个人主页'],
         'value': (proj_list[0].get('link') if proj_list else None), 'unique': True, 'key': 'github', 'skip_date': True},
        {'label_re': r'(?:国家.*地区|国家/地区)', 'parent_kw': ['国家/地区', '国家'], 'value': basic.get('currentCountry', '中国'), 'unique': True, 'key': 'country_generic', 'skip_date': True},
        {'label_re': r'(?:家庭.*城市|家庭所在)', 'parent_kw': ['家庭所在城市', '家庭所在'], 'value': basic.get('currentCity'), 'unique': True, 'key': 'homeCity', 'skip_date': True},
        {'label_re': r'(?:学校.*城市|学校所在)', 'parent_kw': ['学校所在城市', '学校所在'], 'value': basic.get('currentCity'), 'unique': True, 'key': 'schoolCity', 'skip_date': True},
        {'label_re': r'(?:学校全称|学校名称)', 'parent_kw': ['学校全称', '学校名称'], 'value': edu.get('school'), 'unique': True, 'key': 'schoolFull', 'skip_date': True},
        {'label_re': r'(?:招聘信息来源|招聘来源)', 'parent_kw': ['招聘信息来源', '招聘来源'], 'value': resume_data.get('recruitSource', '校园招聘官网'), 'unique': True, 'key': 'recruitSource', 'skip_date': True},
        {'parent_kw': ['身份证号'], 'value': basic.get('idCard') or basic.get('idNumber'), 'unique': True, 'key': 'idNumber2'},
        {'label_re': r'(?:语言类型|语言名称|语言)', 'parent_kw': ['语言类型', '语言名称', '语言能力'],
         'value': resume_data.get('languages') or basic.get('languages'), 'unique': False, 'key': 'language'},
        {'label_re': r'(?:语言水平|掌握程度)', 'parent_kw': ['语言水平', '掌握程度', '熟练程度'],
         'value': resume_data.get('languageLevel') or '熟练', 'unique': False, 'key': 'languageLevel'},
        {'label_re': r'(?:奖项名称|获奖名称|奖项)', 'parent_kw': ['奖项名称', '获奖名称', '奖项'],
         'value': (resume_data.get('awards') or [{}])[0].get('name') if resume_data.get('awards') else None, 'unique': False, 'key': 'awardName'},
        {'label_re': r'(?:获奖时间|获奖日期)', 'parent_kw': ['获奖时间', '获奖日期'],
         'value': (resume_data.get('awards') or [{}])[0].get('date') if resume_data.get('awards') else None, 'unique': False, 'key': 'awardDate'},
        {'label_re': r'(?:获奖等级|奖项等级|级别)', 'parent_kw': ['获奖等级', '奖项等级'],
         'value': (resume_data.get('awards') or [{}])[0].get('level') if resume_data.get('awards') else None, 'unique': False, 'key': 'awardLevel'},
    ]

    # 动态生成日期规则：根据section上下文匹配年月字段
    date_sources = []
    if work.get('startDate'):
        parts = work['startDate'].split('-')
        if len(parts) >= 2:
            date_sources.append({'section_kw': ['工作经历', '工作经验', '实习经历'], 'time_kw': ['开始'], 'year': parts[0], 'month': parts[1]})
    if work.get('endDate'):
        parts = work['endDate'].split('-')
        if len(parts) >= 2:
            date_sources.append({'section_kw': ['工作经历', '工作经验', '实习经历'], 'time_kw': ['结束'], 'year': parts[0], 'month': parts[1]})
    if edu.get('startDate'):
        parts = edu['startDate'].split('-')
        if len(parts) >= 2:
            date_sources.append({'section_kw': ['学历', '教育经历', '教育'], 'time_kw': ['开始'], 'year': parts[0], 'month': parts[1]})
    if edu.get('endDate'):
        parts = edu['endDate'].split('-')
        if len(parts) >= 2:
            date_sources.append({'section_kw': ['学历', '教育经历', '教育'], 'time_kw': ['结束', '毕业'], 'year': parts[0], 'month': parts[1]})
    if proj.get('startDate'):
        parts = proj['startDate'].split('-')
        if len(parts) >= 2:
            date_sources.append({'section_kw': ['项目经验', '项目经历', '项目'], 'time_kw': ['开始'], 'year': parts[0], 'month': parts[1]})
    if proj.get('endDate'):
        parts = proj['endDate'].split('-')
        if len(parts) >= 2:
            date_sources.append({'section_kw': ['项目经验', '项目经历', '项目'], 'time_kw': ['结束'], 'year': parts[0], 'month': parts[1]})

    GENERIC_LABELS = {'联系信息', '工作经验', '学历', '基础信息', '教育经历', '项目经验',
                       '补充信息', '工作意向', '教育经历-1', '工作经历-1',
                       '请输入', '请选择', '请填写', '开始日期', '结束日期'}

    used_keys = set()
    non_unique_count = {}

    for i, field in enumerate(fields):
        if field.get('readOnly'):
            # readOnly字段仍然尝试匹配身份证号和日期
            parent = (field.get('parentText') or '')
            label = (field.get('label') or '')
            ctx = label + ' ' + parent
            if not re.search(r'身份证|开始日期|结束日期|时间|出生|生日|birthday', ctx):
                continue
        for rule in rules:
            rkey = rule['key']
            if rule['unique'] and rkey in used_keys:
                continue
            if not rule['unique'] and non_unique_count.get(rkey, 0) >= 1:
                name_hit = rule.get('name_re') and test_field_attr(field, None, rule.get('name_re'), None)
                label_hit = rule.get('label_re') and test_field_attr(field, rule.get('label_re'), None, None)
                parent_hit = rule.get('parent_kw') and search_parent_text(field, rule['parent_kw'])
                if not name_hit and not label_hit and not parent_hit:
                    continue
            if not rule.get('value'):
                if i == 1 and rkey == 'idNumber':
                    print(f"  [DEBUG-F1] idNumber rule skipped: no value", flush=True)
                continue
            if rule.get('skip_date') and is_date_related_field(field):
                continue
            if rule.get('only_select') and field.get('tag') not in ('select', 'div') and field.get('customType') not in ('dropdown', 'input-dropdown'):
                continue
            if rule.get('skip_dropdown') and field.get('customType') in ('dropdown', 'input-dropdown'):
                continue

            if i == 1 and rkey in ('idNumber', 'idNumber2'):
                print(f"  [DEBUG-F1] testing rule [{rkey}] name_re={rule.get('name_re')!r} value={rule.get('value')!r}", flush=True)

            hit = test_field_attr(field, rule.get('label_re'), rule.get('name_re'), rule.get('class_re'), debug_idx=i if i == 1 else None)

            if not hit and rule.get('parent_kw'):
                label = (field.get('label') or '').strip()
                can_try_parent = not label or label in GENERIC_LABELS or not field.get('name') or len(label) <= 5
                if can_try_parent:
                    hit = search_parent_text(field, rule['parent_kw'])
                    if hit and rkey in ('idNumber', 'idNumber2'):
                        print(f"  [DEBUG] 字段[{i}] 身份证规则命中 parent=\"{(field.get('parentText') or '')[:30]}\"", flush=True)

            if hit:
                matched[str(i)] = {'value': rule['value'], 'key': rkey}
                print(f"  [规则] 字段[{i}] 匹配规则 [{rkey}] label=\"{(field.get('label') or '')[:20]}\" parent=\"{(field.get('parentText') or '')[:30]}\"", flush=True)
                if rule['unique']:
                    used_keys.add(rkey)
                else:
                    non_unique_count[rkey] = non_unique_count.get(rkey, 0) + 1
                break

    # 日期字段规则匹配：按位置分组，根据后续字段确定所属段落
    date_indices = []
    for i, field in enumerate(fields):
        if str(i) in matched or field.get('readOnly'):
            continue
        cls = (field.get('className') or '').lower()
        label = (field.get('label') or '').strip()
        is_year = bool(re.search(r'year', cls)) or label == '年'
        is_month = bool(re.search(r'month', cls)) or label == '月'
        if is_year or is_month:
            date_indices.append((i, 'year' if is_year else 'month'))

    date_groups = []
    cur_group = []
    for idx, kind in date_indices:
        if cur_group and idx - cur_group[-1][0] > 2:
            date_groups.append(cur_group)
            cur_group = []
        cur_group.append((idx, kind))
    if cur_group:
        date_groups.append(cur_group)

    work_date_count = 0
    edu_date_used = False
    proj_date_used = False
    for group in date_groups:
        last_idx = group[-1][0]
        section_hint = ''
        for fi in range(last_idx + 1, min(last_idx + 6, len(fields))):
            f = fields[fi]
            section_hint += ' ' + (f.get('label') or '') + ' ' + (f.get('context') or '') + ' ' + (f.get('nearby') or '')

        data_source = None
        prefix = ''
        is_work = any(kw in section_hint for kw in ['公司', '职位', '工作', '实习'])
        is_edu = any(kw in section_hint for kw in ['学校', '专业', '学历', '就读'])
        is_proj = any(kw in section_hint for kw in ['项目'])

        if is_edu and not edu_date_used:
            data_source = edu
            prefix = 'edu'
            edu_date_used = True
        elif is_proj and not proj_date_used:
            data_source = proj
            prefix = 'proj'
            proj_date_used = True
        elif is_work and work_date_count < 2:
            data_source = work
            prefix = f'work{work_date_count}' if work_date_count > 0 else 'work'
            work_date_count += 1

        if not data_source:
            print(f"  [DATE] 跳过日期组 {[g[0] for g in group]}: 无法确定段落 hint='{section_hint[:60]}'", flush=True)
            continue

        start_date = data_source.get('startDate', '')
        end_date = data_source.get('endDate', '')
        s_parts = start_date.split('-') if start_date else []
        e_parts = end_date.split('-') if end_date else []

        if len(group) >= 4:
            if len(s_parts) >= 2:
                matched[str(group[0][0])] = {'value': s_parts[0], 'key': f'{prefix}_start_year'}
                matched[str(group[1][0])] = {'value': str(int(s_parts[1])), 'key': f'{prefix}_start_month'}
            if len(e_parts) >= 2:
                matched[str(group[2][0])] = {'value': e_parts[0], 'key': f'{prefix}_end_year'}
                matched[str(group[3][0])] = {'value': str(int(e_parts[1])), 'key': f'{prefix}_end_month'}
            print(f"  [DATE] 组{[g[0] for g in group]} → {prefix} start={start_date} end={end_date}", flush=True)
        elif len(group) == 2:
            if len(s_parts) >= 2:
                matched[str(group[0][0])] = {'value': s_parts[0], 'key': f'{prefix}_date_year'}
                matched[str(group[1][0])] = {'value': str(int(s_parts[1])), 'key': f'{prefix}_date_month'}
            print(f"  [DATE] 组{[g[0] for g in group]} → {prefix} date={start_date}", flush=True)

    # 日期文本输入框匹配（label/parentText含"开始"/"结束"+"日期"/"时间"的input字段）
    date_text_used = set()
    for i, field in enumerate(fields):
        if str(i) in matched:
            continue
        if field.get('tag') != 'input':
            continue
        label = (field.get('label') or '').strip()
        parent = (field.get('parentText') or '').strip()
        combined = label + ' ' + parent
        # 必须含有"开始"或"结束"，且含有"日期"或"时间"
        has_date_kw = bool(re.search(r'日期|时间', combined))
        has_direction = bool(re.search(r'开始|结束', combined))
        if not has_date_kw or not has_direction:
            continue
        section = (field.get('section') or '')
        ctx = section + ' ' + parent

        is_start = '开始' in combined
        # 判断属于哪个section
        data_source = None
        if any(kw in ctx for kw in ['公司', '组织', '工作', '实习']):
            data_source = work
            prefix = 'work'
        elif any(kw in ctx for kw in ['项目']):
            data_source = proj
            prefix = 'proj'
        else:
            data_source = edu
            prefix = 'edu'

        date_key = f'{prefix}_{"start" if is_start else "end"}_text'
        if date_key in date_text_used:
            print(f"  [DATE] 字段[{i}] date_key={date_key} 已使用，跳过", flush=True)
            continue

        val = data_source.get('startDate' if is_start else 'endDate', '')
        print(f"  [DATE] 字段[{i}] prefix={prefix} is_start={is_start} val={val!r} date_key={date_key}", flush=True)
        if val:
            matched[str(i)] = {'value': val, 'key': date_key}
            date_text_used.add(date_key)
            print(f"  [DATE] 字段[{i}] 匹配成功! -> {val}", flush=True)

    return matched


# ========== AI 调用 ==========

def clean_think_tags(content):
    if not content:
        return ''
    cleaned = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
    if '<think>' in cleaned:
        cleaned = re.sub(r'<think>[\s\S]*', '', cleaned).strip()
    return cleaned


def extract_key_class(cls):
    if not cls:
        return ''
    keywords = ['select', 'input', 'dropdown', 'date', 'picker', 'radio', 'check', 'textarea', 'phone', 'email', 'upload']
    parts = re.split(r'[\s]+', cls)
    matched_parts = [p for p in parts if any(kw in p.lower() for kw in keywords)]
    return ' '.join(matched_parts[:3])


def build_ai_payload(fields, resume_data, field_indices):
    """构建发给AI的精简JSON载荷"""
    field_list = []
    for local_idx, global_idx in enumerate(field_indices):
        f = fields[global_idx]
        item = {'fieldId': f'f_{local_idx}', 'kind': 'dropdown' if f.get('customType') == 'dropdown' else f.get('type', 'text')}
        if f.get('label'):
            item['label'] = f['label']
        if f.get('name'):
            item['name'] = f['name']
        if f.get('id') and len(f['id']) < 30:
            item['id'] = f['id']
        if f.get('placeholder') and f.get('placeholder') != f.get('label'):
            item['placeholder'] = f['placeholder']
        if f.get('context') and f.get('context') != f.get('label'):
            item['context'] = f['context'][:60]
        if f.get('value') and len(str(f['value'])) <= 100:
            item['currentValue'] = f['value']
        key_cls = extract_key_class(f.get('className'))
        if key_cls:
            item['cls'] = key_cls
        if f.get('options'):
            item['options'] = [o.get('text', o) if isinstance(o, dict) else str(o) for o in f['options']][:30]
        if f.get('readOnly'):
            item['readOnly'] = True
        if f.get('section'):
            item['section'] = f['section']
        if f.get('nearby'):
            item['nearby'] = f['nearby']
        field_list.append(item)

    basic = resume_data.get('basic') or {}
    edu = (resume_data.get('education') or [{}])[0]
    work = (resume_data.get('work') or resume_data.get('experience') or [{}])[0]
    proj = (resume_data.get('projects') or [{}])[0]

    resume_compact = {'basic': basic}
    if edu:
        resume_compact['education'] = [edu]
    if work:
        resume_compact['experience'] = [work]
    if proj:
        resume_compact['projects'] = [proj]

    payload = {'fields': field_list, 'resume': resume_compact}
    return json.dumps(payload, ensure_ascii=False)


def call_ai_streaming(config, user_prompt, batch_label=''):
    """流式SSE调用AI，带prefill和早期中断"""
    THINK_ABORT_THRESHOLD = 1500
    timeout_connect = 15
    timeout_read = 120

    api_url = ensure_full_api_url(config['apiUrl'])
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f"Bearer {config['apiKey']}",
    }

    messages = [
        {'role': 'system', 'content': FORM_FILL_SYSTEM_PROMPT},
        {'role': 'user', 'content': user_prompt},
        {'role': 'assistant', 'content': '{"fills":[', 'prefix': True},
    ]

    body = {
        'model': config['model'],
        'temperature': 0.3,
        'max_tokens': 2048,
        'stream': True,
        'messages': messages,
    }

    start_time = time.time()
    resp = http_requests.post(
        api_url,
        headers=headers,
        json=body,
        stream=True,
        timeout=(timeout_connect, timeout_read),
        verify=True,
    )
    resp.raise_for_status()

    content_type = resp.headers.get('content-type', '')
    if 'application/json' in content_type and 'text/event-stream' not in content_type:
        resp.encoding = 'utf-8'
        data = resp.json()
        raw = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        cleaned = clean_think_tags(raw)
        result = cleaned if cleaned.lstrip().startswith('{"fills"') else '{"fills":[' + cleaned
        elapsed = time.time() - start_time
        print(f'[AI] {batch_label} 非流式完成: {elapsed:.1f}s, {len(result)}字符', flush=True)
        return result

    resp.encoding = 'utf-8'
    full_content = ''
    think_chars = 0
    json_chars = 0
    buffer = ''

    for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
        if not chunk:
            continue
        buffer += chunk
        lines = buffer.split('\n')
        buffer = lines[-1]

        for line in lines[:-1]:
            trimmed = line.strip()
            if not trimmed.startswith('data:'):
                continue
            data_str = trimmed[5:].strip()
            if data_str == '[DONE]':
                break
            try:
                parsed = json.loads(data_str)
                delta = parsed.get('choices', [{}])[0].get('delta', {}).get('content', '')
                if delta:
                    full_content += delta
                    if '<think>' in full_content and '</think>' not in full_content:
                        think_chars += len(delta)
                        if think_chars > THINK_ABORT_THRESHOLD and json_chars == 0:
                            resp.close()
                            raise ThinkOverflowError(f'<think>已达{think_chars}字符，强制中断')
                    else:
                        json_chars += len(delta)
                if parsed.get('choices', [{}])[0].get('finish_reason'):
                    break
            except (json.JSONDecodeError, ThinkOverflowError) as e:
                if isinstance(e, ThinkOverflowError):
                    raise
                continue

    elapsed = time.time() - start_time
    cleaned = clean_think_tags(full_content)
    if not cleaned:
        raise ThinkOverflowError(f'全部{len(full_content)}字符都是<think>思考内容')

    result = cleaned if cleaned.lstrip().startswith('{"fills"') else '{"fills":[' + cleaned
    print(f'[AI] {batch_label} 流式完成: {elapsed:.1f}s, 总{len(full_content)}字符, think={think_chars}, json={json_chars}', flush=True)
    return result


class ThinkOverflowError(Exception):
    pass


def call_ai_non_streaming(config, user_prompt, batch_label='', temperature=0.3):
    """非流式AI调用（作为流式失败的降级方案）"""
    api_url = ensure_full_api_url(config['apiUrl'])
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f"Bearer {config['apiKey']}",
    }
    messages = [
        {'role': 'system', 'content': FORM_FILL_SYSTEM_PROMPT + '\n\n再次强调：直接输出JSON，禁止输出<think>标签。'},
        {'role': 'user', 'content': user_prompt + '\n\n直接输出JSON结果，不要思考过程。'},
        {'role': 'assistant', 'content': '{"fills":[', 'prefix': True},
    ]
    body = {
        'model': config['model'],
        'temperature': 0.5,
        'max_tokens': 2048,
        'stream': False,
        'messages': messages,
    }
    start_time = time.time()
    resp = http_requests.post(api_url, headers=headers, json=body, timeout=(15, 90), verify=True)
    resp.encoding = 'utf-8'
    resp.raise_for_status()
    data = resp.json()
    raw = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    cleaned = clean_think_tags(raw)
    if not cleaned:
        raise Exception(f'非流式响应全为<think>内容 ({len(raw)}字符)')
    result = cleaned if cleaned.lstrip().startswith('{"fills"') else '{"fills":[' + cleaned
    elapsed = time.time() - start_time
    print(f'[AI] {batch_label} 非流式降级完成: {elapsed:.1f}s, {len(result)}字符', flush=True)
    return result


def call_ai_with_retry(config, user_prompt, batch_label='', max_retries=2):
    """AI调用带重试：流式→流式重试→非流式降级"""
    for attempt in range(max_retries + 1):
        try:
            if attempt < max_retries:
                return call_ai_streaming(config, user_prompt, batch_label)
            else:
                return call_ai_non_streaming(config, user_prompt, batch_label)
        except ThinkOverflowError as e:
            print(f'[AI] {batch_label} think溢出(第{attempt+1}次)，{"切换非流式" if attempt == max_retries - 1 else "重试"}...', flush=True)
            continue
        except http_requests.exceptions.Timeout:
            if attempt < max_retries:
                print(f'[AI] {batch_label} 超时(第{attempt+1}次)，重试...', flush=True)
                continue
            raise Exception(f'API请求超时')
        except http_requests.exceptions.RequestException as e:
            raise Exception(f'API请求失败: {str(e)}')
    raise Exception('AI调用失败，已达最大重试次数')


def parse_ai_response(text):
    """解析AI响应JSON，带自动修复"""
    json_str = text
    json_str = re.sub(r'<think>[\s\S]*?</think>', '', json_str).strip()
    if '<think>' in json_str:
        json_str = re.sub(r'<think>[\s\S]*', '', json_str).strip()
    if not json_str:
        raise Exception('AI响应为空')

    code_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', json_str)
    if code_match:
        json_str = code_match.group(1).strip()

    json_match = re.search(r'\{[\s\S]*\}', json_str)
    if json_match:
        json_str = json_match.group(0)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        repaired = json_str
        open_brackets = repaired.count('[') - repaired.count(']')
        open_braces = repaired.count('{') - repaired.count('}')
        repaired += ']' * max(0, open_brackets)
        repaired += '}' * max(0, open_braces)
        repaired = re.sub(r',\s*([}\]])', r'\1', repaired)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            raise Exception(f'JSON解析失败: {json_str[:200]}')


def process_fill_request(fields, resume_data):
    """
    核心填充逻辑：规则匹配 + AI批量调用
    返回: {fieldIndex: value} 的映射
    """
    config = load_ai_config()
    logs = []

    def add_log(level, msg):
        t = datetime.now().strftime('%H:%M:%S')
        logs.append({'time': t, 'level': level, 'msg': msg})
        print(f'[{level}] {msg}', flush=True)

    add_log('info', f'收到填充请求: {len(fields)} 个字段')

    for i, f in enumerate(fields):
        label = (f.get('label') or '')[:20]
        cls = (f.get('className') or '')[:40]
        nearby = (f.get('nearby') or '')[:30]
        pt = (f.get('parentText') or '')[:30]
        print(f'  [字段{i}] label="{label}" class="{cls}" nearby="{nearby}" parent="{pt}"', flush=True)

    rule_results = rule_match(fields, resume_data)
    add_log('info', f'规则匹配完成: {len(rule_results)} 个字段命中')

    fill_results = {}
    for idx_str, info in rule_results.items():
        fill_results[idx_str] = info['value']
        add_log('info', f'  规则[{info["key"]}] → 字段[{idx_str}] = "{str(info["value"])[:40]}"')

    remaining_indices = []
    for i, field in enumerate(fields):
        if str(i) in fill_results or field.get('readOnly'):
            continue
        if field.get('type') == 'checkbox' or field.get('tag') == 'checkbox':
            continue
        if (field.get('name') or '').lower() in ('policy', 'agree', 'privacy', 'terms'):
            continue
        remaining_indices.append(i)

    add_log('info', f'需AI处理: {len(remaining_indices)} 个字段')

    if not remaining_indices:
        return fill_results, logs

    AI_ENABLED = True

    if not config.get('apiKey'):
        add_log('error', 'AI未配置API Key，跳过AI填充')
        return fill_results, logs

    BATCH_SIZE = 5
    batches = []
    for i in range(0, len(remaining_indices), BATCH_SIZE):
        batches.append(remaining_indices[i:i + BATCH_SIZE])

    add_log('info', f'AI分{len(batches)}批并行处理')

    def process_batch(batch_indices, batch_idx):
        batch_label = f'(第{batch_idx+1}/{len(batches)}批)'
        try:
            user_prompt = build_ai_payload(fields, resume_data, batch_indices)
            add_log('info', f'{batch_label} 提示词长度: {len(user_prompt)} 字符, 字段数: {len(batch_indices)}')

            raw_response = call_ai_with_retry(config, user_prompt, batch_label)
            add_log('info', f'{batch_label} AI响应长度: {len(raw_response)} 字符')

            parsed = parse_ai_response(raw_response)
            fills = parsed.get('fills', [])
            add_log('info', f'{batch_label} 解析成功: {len(fills)} 个字段映射')

            batch_results = {}
            for fill_item in fills:
                field_id = fill_item.get('fieldId', '')
                value = fill_item.get('value', '')
                local_idx = int(re.sub(r'\D', '', field_id)) if re.search(r'\d+', field_id) else -1
                if 0 <= local_idx < len(batch_indices) and value:
                    global_idx = batch_indices[local_idx]
                    batch_results[str(global_idx)] = value

            return batch_results
        except Exception as e:
            add_log('error', f'{batch_label} 失败: {str(e)}')
            return {}

    with ThreadPoolExecutor(max_workers=min(len(batches), 4)) as executor:
        futures = {
            executor.submit(process_batch, batch, idx): idx
            for idx, batch in enumerate(batches)
        }
        for future in as_completed(futures):
            batch_results = future.result()
            fill_results.update(batch_results)

    add_log('info', f'填充完成: 总计 {len(fill_results)} 个字段')
    return fill_results, logs


# ========== API 路由 ==========

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'time': datetime.now().isoformat()})


@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json(silent=True) or {}
    key = data.get('key', '')
    if not key:
        return jsonify({'success': False, 'message': '请提供密钥'}), 400
    if verify_key(key):
        return jsonify({'success': True, 'message': '授权成功'})
    else:
        return jsonify({'success': False, 'message': '密钥无效或已停用'}), 403


@app.route('/api/verify', methods=['POST'])
def verify():
    """密钥验证接口（供插件使用，通过 Authorization Bearer 头传递密钥）"""
    auth_header = request.headers.get('Authorization', '')
    key = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
    if not key:
        return jsonify({'success': False, 'message': '请提供密钥'}), 400
    if verify_key(key):
        return jsonify({'success': True, 'message': '密钥验证通过'})
    else:
        return jsonify({'success': False, 'message': '密钥无效或已停用'}), 403


@app.route('/api/fill', methods=['POST'])
def fill():
    """核心接口：接收表单字段，返回填充结果"""
    auth_header = request.headers.get('Authorization', '')
    key = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
    if not verify_key(key):
        return jsonify({'success': False, 'message': '未授权'}), 403

    data = request.get_json(silent=True) or {}
    fields = data.get('fields', [])
    resume_data = data.get('resumeData', {})
    rules_only = data.get('rulesOnly', False)

    if not fields:
        return jsonify({'success': False, 'message': '字段列表为空'}), 400

    try:
        if rules_only:
            rule_results = rule_match(fields, resume_data)
            fills = {k: v['value'] for k, v in rule_results.items()}
            logs = [{'time': datetime.now().strftime('%H:%M:%S'), 'level': 'info', 'msg': f'规则匹配: {len(fills)} 个字段命中'}]
            for idx_str, info in rule_results.items():
                logs.append({'time': datetime.now().strftime('%H:%M:%S'), 'level': 'info', 'msg': f'  规则[{info["key"]}] → 字段[{idx_str}]'})
            return jsonify({
                'success': True,
                'fills': fills,
                'logs': logs,
                'matchedCount': len(fills),
                'totalFields': len(fields),
            })

        fill_results, process_logs = process_fill_request(fields, resume_data)
        return jsonify({
            'success': True,
            'fills': fill_results,
            'logs': process_logs,
            'matchedCount': len(fill_results),
            'totalFields': len(fields),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/ai-config', methods=['GET'])
def get_ai_config():
    """获取AI配置（隐藏key）"""
    config = load_ai_config()
    safe_config = dict(config)
    if safe_config.get('apiKey'):
        safe_config['apiKey'] = safe_config['apiKey'][:8] + '***'
    return jsonify({'success': True, 'config': safe_config})


@app.route('/api/ai-config', methods=['POST'])
def update_ai_config():
    """更新AI配置"""
    admin_key = request.headers.get('X-Admin-Key', '')
    if admin_key != ADMIN_SECRET:
        return jsonify({'success': False, 'message': '需要管理员权限'}), 403
    data = request.get_json(silent=True) or {}
    config = load_ai_config()
    for key in ('apiUrl', 'apiKey', 'model', 'maxTokens', 'temperature'):
        if key in data:
            config[key] = data[key]
    save_ai_config(config)
    return jsonify({'success': True, 'message': 'AI配置已更新'})


@app.route('/api/logs', methods=['POST'])
def submit_logs():
    auth_header = request.headers.get('Authorization', '')
    key = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
    if not verify_key(key):
        return jsonify({'success': False, 'message': '未授权'}), 403

    data = request.get_json(silent=True) or {}
    client_id = data.get('clientId', 'unknown')
    entry = save_log(client_id, data)
    return jsonify({'success': True, 'message': '日志已保存'})


@app.route('/api/logs', methods=['GET'])
def get_logs():
    auth_header = request.headers.get('Authorization', '')
    key = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
    if not verify_key(key):
        return jsonify({'success': False, 'message': '未授权'}), 403

    date = request.args.get('date', None)
    limit = int(request.args.get('limit', 50))
    logs = read_logs(date=date, limit=limit)
    return jsonify({'success': True, 'count': len(logs), 'logs': logs})


@app.route('/api/logs/latest', methods=['GET'])
def get_latest_log():
    auth_header = request.headers.get('Authorization', '')
    key = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
    if not verify_key(key):
        return jsonify({'success': False, 'message': '未授权'}), 403

    logs = read_logs(limit=1)
    if logs:
        return jsonify({'success': True, 'log': logs[-1]})
    else:
        return jsonify({'success': True, 'log': None, 'message': '暂无日志'})


@app.route('/api/keys', methods=['GET'])
def list_keys():
    admin_key = request.headers.get('X-Admin-Key', '')
    if admin_key != ADMIN_SECRET:
        return jsonify({'success': False, 'message': '需要管理员权限'}), 403
    keys = load_keys()
    return jsonify({'success': True, 'keys': keys})


@app.route('/api/keys', methods=['POST'])
def create_key():
    admin_key = request.headers.get('X-Admin-Key', '')
    if admin_key != ADMIN_SECRET:
        return jsonify({'success': False, 'message': '需要管理员权限'}), 403

    data = request.get_json(silent=True) or {}
    name = data.get('name', 'unnamed')
    new_key = create_key_in_db(name)
    return jsonify({'success': True, 'key': new_key})


@app.route('/api/keys/<key_id>', methods=['DELETE'])
def delete_key(key_id):
    """停用指定密钥"""
    admin_key = request.headers.get('X-Admin-Key', '')
    if admin_key != ADMIN_SECRET:
        return jsonify({'success': False, 'message': '需要管理员权限'}), 403

    if deactivate_key_in_db(key_id):
        return jsonify({'success': True, 'message': '密钥已停用'})
    else:
        return jsonify({'success': False, 'message': '密钥不存在'}), 404


ADMIN_SECRET = os.environ.get('ADMIN_SECRET', 'resume-admin-2026')

if __name__ == '__main__':
    init_db()
    init_default_key()
    config = load_ai_config()
    print(f'[启动] 后端服务运行在 http://0.0.0.0:5000')
    print(f'[启动] 管理员密钥: {ADMIN_SECRET}')
    print(f'[启动] 数据库: {DB_FILE}')
    print(f'[启动] AI模型: {config["model"]} @ {config["apiUrl"][:50]}...')
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
