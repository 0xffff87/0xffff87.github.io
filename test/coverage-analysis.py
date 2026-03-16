# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
"""
静态分析三个招聘网站的表单字段覆盖率
模拟content.js中的clientRuleMatch规则匹配逻辑
"""
import re

RESUME = {
    'name': '张明远', 'gender': '男', 'birthday': '2000-06-15',
    'phone': '13800138000', 'email': 'zhangmingyuan@example.com',
    'ethnicity': '汉族', 'politicalStatus': '共青团员',
    'hometown': '山东省济南市', 'address': '山东省济南市历下区经十路88号',
    'idCard': '370102200006150012', 'currentCountry': '中国', 'currentCity': '济南',
    'targetCity': '北京', 'targetPosition': '后端开发工程师',
    'expectedSalary': '18k-30k', 'wechat': 'zhangmingyuan2000',
    'summary': '计算机科学与技术专业应届硕士毕业生',
    'workExperience': '无工作经验',
}
EDU = {
    'school': '山东大学', 'degree': '硕士', 'major': '计算机科学与技术',
    'startDate': '2023-09', 'endDate': '2026-06', 'gpa': '3.7/4.0',
    'department': '计算机科学与技术学院', 'educationType': '统招全日制',
}
WORK = {
    'company': '字节跳动', 'position': '后端开发实习生', 'title': '后端开发实习生',
    'department': '基础架构', 'description': '参与内容推荐系统后端服务开发',
    'startDate': '2025-06', 'endDate': '2025-09',
}
PROJ = {
    'name': '智能简历填写助手', 'role': '项目负责人',
    'description': '基于浏览器插件和AI技术开发智能简历自动填写工具',
    'link': 'https://github.com/example', 'startDate': '2025-01', 'endDate': '2025-06',
}

def build_rules():
    """构建与content.js完全一致的规则列表"""
    rules = [
        {'label_re': r'^(?:姓名|真实姓名|请输入真实姓名|请输入姓名|名字)$', 'name_re': r'^(?:name|姓名)$',
         'parent_kw': ['姓名','名字','真实姓名'], 'value': RESUME['name'], 'unique': True, 'key': 'name'},
        {'label_re': r'^(?:区号)$', 'class_re': r'telephone-region',
         'parent_kw': ['区号'], 'value': '+86', 'unique': True, 'key': 'areaCode'},
        {'label_re': r'(?:手机|电话|联系方式|手机号|请输入.*手机号)', 'name_re': r'^(?:phone|mobile|tel|cellphone|手机号码)$',
         'class_re': r'telephone-input|phone-input', 'parent_kw': ['手机','电话','联系方式','手机号码'],
         'value': RESUME['phone'], 'unique': True, 'key': 'phone'},
        {'label_re': r'(?:邮箱|邮件|电子邮箱|请.*邮箱)', 'name_re': r'^(?:e-?mail|email|邮箱)$',
         'class_re': r'e-?mail-input', 'parent_kw': ['邮箱','邮件','电子邮箱'],
         'value': RESUME['email'], 'unique': True, 'key': 'email'},
        {'label_re': r'^(?:性别)$', 'name_re': r'^(?:gender|sex)$',
         'parent_kw': ['性别'], 'value': RESUME['gender'], 'unique': True, 'key': 'gender'},
        {'label_re': r'(?:工作经验|工作年限)', 'parent_kw': ['工作经验','工作年限'],
         'value': RESUME['workExperience'], 'unique': True, 'key': 'workExperience', 'only_select': True},
        {'label_re': r'(?:出生|生日|birthday)', 'name_re': r'(?:birth)',
         'parent_kw': ['出生','生日'], 'value': RESUME['birthday'], 'unique': True, 'key': 'birthday'},
        {'label_re': r'^(?:身份证|证件类型)$', 'parent_kw': ['证件类型','证件名称'],
         'value': '身份证', 'unique': True, 'key': 'certType', 'only_select': True},
        {'label_re': r'(?:证件号码|身份证号|个人证件)', 'name_re': r'(?:cardnum|idcard|idnumber|个人证件|identification)',
         'parent_kw': ['证件号码','身份证号','个人证件'], 'value': RESUME['idCard'], 'unique': True, 'key': 'idNumber'},
        {'label_re': r'(?:政治面貌)', 'parent_kw': ['政治面貌'], 'value': RESUME['politicalStatus'], 'unique': True, 'key': 'political'},
        {'label_re': r'(?:民族|族别)', 'parent_kw': ['民族'], 'value': RESUME['ethnicity'], 'unique': True, 'key': 'ethnicity'},
        {'label_re': r'(?:籍贯|户口)', 'parent_kw': ['籍贯','户口'], 'value': RESUME['hometown'], 'unique': True, 'key': 'hometown'},
        {'label_re': r'(?:通信地址|住址|通讯地址|地址)', 'parent_kw': ['通信地址','地址','住址'], 'value': RESUME['address'], 'unique': True, 'key': 'address'},
        {'label_re': r'(?:选择国家|当前居住国家|居住国家)', 'class_re': r'country-input(?!.*expectWork)',
         'parent_kw': ['当前居住国家','居住国家'], 'value': '中国', 'unique': True, 'key': 'currentCountry'},
        {'label_re': r'(?:现居住|所在地|当前城市|居住城市|省\/市)', 'parent_kw': ['现居住','所在地','当前城市','当前居住省/市','居住省/市'],
         'value': RESUME['currentCity'], 'unique': True, 'key': 'currentCity'},
        {'label_re': r'(?:最近公司|最近工作)', 'parent_kw': ['最近公司'], 'value': WORK['company'], 'unique': True, 'key': 'recentCompany'},
        {'label_re': r'(?:期望工作国家|请选择国家)', 'class_re': r'expectWorkCountry',
         'parent_kw': ['期望工作国家'], 'value': '中国大陆', 'unique': True, 'key': 'expectCountry'},
        {'label_re': r'(?:意向.*城市|意愿.*城市|意向.*地点|目标.*城市|期望.*城市|期望.*地点)', 'name_re': r'^(?:preferred_city_list)$',
         'parent_kw': ['意向工作城市','意愿城市','意向地点','期望工作城市','期望城市','期望工作地点'],
         'value': RESUME['targetCity'], 'unique': True, 'key': 'targetCity'},
        {'label_re': r'(?:当前薪资|目前薪资|现在薪资)', 'parent_kw': ['当前薪资','目前薪资'], 'value': RESUME['expectedSalary'], 'unique': True, 'key': 'currentSalary'},
        {'label_re': r'(?:期望.*薪|年薪|月薪|期望薪资)', 'parent_kw': ['期望年薪','年薪','月薪','期望薪资'], 'value': RESUME['expectedSalary'], 'unique': True, 'key': 'expectedSalary'},
        {'label_re': r'(?:自我评价|自我介绍|自我描述|补充信息|简介|介绍自己)', 'parent_kw': ['自我评价','自我介绍','自我描述','补充信息','介绍自己'],
         'value': RESUME['summary'], 'unique': True, 'key': 'summary'},
        {'label_re': r'(?:微信号|微信)', 'parent_kw': ['微信号','微信'], 'value': RESUME['wechat'], 'unique': True, 'key': 'wechat'},
        {'label_re': r'^(?:学校|学校名称|请输入就读学校)$', 'name_re': r'^(?:school|学校名称)$', 'class_re': r'school-input',
         'parent_kw': ['学校名称','学校'], 'value': EDU['school'], 'unique': False, 'key': 'school'},
        {'label_re': r'^(?:专业|专业名称|请输入专业名称)$', 'name_re': r'^(?:major|field_of_study|专业)$',
         'parent_kw': ['专业名称','专业'], 'value': EDU['major'], 'unique': False, 'key': 'major'},
        {'label_re': r'^(?:学历|最高学历)$', 'name_re': r'^(?:degree|education)$', 'class_re': r'education-required|degree',
         'parent_kw': ['学历','最高学历'], 'value': EDU['degree'], 'unique': False, 'key': 'degree', 'only_select': True},
        {'label_re': r'^(?:公司名称|企业名称)$', 'name_re': r'^(?:company|companyName?\d*|公司名称)$',
         'parent_kw': ['公司名称','企业名称'], 'value': WORK['company'], 'unique': False, 'key': 'company'},
        {'label_re': r'^(?:所在部门|部门名称)$', 'name_re': r'^(?:department\d*|实习部门)$',
         'parent_kw': ['实习部门','部门','工作部门','所在部门'], 'value': WORK['department'], 'unique': False, 'key': 'department'},
        {'label_re': r'^(?:工作职位|岗位名称|职位名称)$', 'name_re': r'^(?:positionName\d*|work|title|职位名称)$',
         'parent_kw': ['岗位名称','工作岗位','岗位','职位名称','工作职位'], 'value': WORK['position'], 'unique': False, 'key': 'position'},
        {'label_re': r'^(?:工作描述|描述|工作内容)$', 'name_re': r'^(?:workDesc\d*|desc)$', 'class_re': r'describe-input',
         'parent_kw': ['工作职责','实习工作内容','实习内容','工作内容','工作描述'], 'value': WORK['description'], 'unique': False, 'key': 'workDesc'},
        {'label_re': r'^(?:项目名称)$', 'name_re': r'^(?:subjectName\d*|项目名称)$',
         'parent_kw': ['项目名称'], 'value': PROJ['name'], 'unique': False, 'key': 'projectName'},
        {'label_re': r'^(?:职责|项目角色|项目职务)$', 'name_re': r'^(?:position\d+|项目角色)$',
         'parent_kw': ['项目角色','项目职位','项目职责','项目职务'], 'value': PROJ['role'], 'unique': False, 'key': 'projectPosition'},
        {'name_re': r'^(?:subjectDesc\d*)$', 'parent_kw': ['项目描述','项目内容'], 'value': PROJ['description'], 'unique': False, 'key': 'projectDesc'},
        {'label_re': r'^(?:项目中职责)$', 'name_re': r'^(?:positionDesc\d*)$',
         'parent_kw': ['项目中职责'], 'value': PROJ['role'], 'unique': False, 'key': 'projectRole'},
        {'label_re': r'^(?:作品链接|作品地址)$', 'name_re': r'^(?:portfolioAddress\d*)$', 'parent_kw': ['作品链接','作品地址'],
         'value': PROJ['link'], 'unique': False, 'key': 'portfolioLink'},
        {'name_re': r'^(?:portfolioDesc\d*)$', 'parent_kw': ['作品集','作品集描述'], 'value': PROJ['name'], 'unique': False, 'key': 'portfolioDesc'},
        {'label_re': r'^(?:学历类型)$', 'name_re': r'^(?:education_type)$', 'parent_kw': ['学历类型'],
         'value': EDU['educationType'], 'unique': True, 'key': 'educationType', 'only_select': True},
        {'label_re': r'^(?:目标职位类别|意向职位类别)$', 'parent_kw': ['目标职位类别','意向职位'],
         'value': RESUME['targetPosition'], 'unique': True, 'key': 'targetPositionType', 'only_select': True},
        {'label_re': r'^(?:可面试方式|面试方式)$', 'parent_kw': ['可面试方式','面试方式'],
         'value': '线上面试', 'unique': True, 'key': 'interviewType', 'only_select': True},
        {'label_re': r'(?:导师|指导老师|指导教师)', 'name_re': r'^导师$', 'parent_kw': ['导师','指导老师','指导教师'],
         'value': '李教授', 'unique': True, 'key': 'advisor'},
        {'label_re': r'(?:实验室)', 'name_re': r'^实验室$', 'parent_kw': ['实验室'], 'value': '智能计算实验室', 'unique': True, 'key': 'lab'},
        {'label_re': r'(?:研究方向|研究领域|领域方向)', 'name_re': r'^领域方向$', 'parent_kw': ['研究方向','研究领域','领域方向'],
         'value': '机器学习', 'unique': True, 'key': 'researchDirection'},
        {'label_re': r'(?:GPA|绩点|成绩)', 'parent_kw': ['GPA','GPA成绩','绩点'], 'value': EDU['gpa'], 'unique': True, 'key': 'gpa'},
        {'label_re': r'(?:院系|学院|所在院)', 'name_re': r'^学院$', 'parent_kw': ['院系','学院','所在院系','所在院'],
         'value': EDU['department'], 'unique': True, 'key': 'department_edu'},
        {'label_re': r'(?:国家.*地区|国家\/地区|国籍.*地区|国籍\/地区)', 'parent_kw': ['国家/地区','国家','国籍/地区','国籍'],
         'value': '中国', 'unique': True, 'key': 'country_generic'},
        {'label_re': r'(?:github|个人主页|个人网站)', 'parent_kw': ['Github','github','个人主页'],
         'value': PROJ['link'], 'unique': True, 'key': 'github'},
        {'label_re': r'(?:行业类别|所在行业|行业)', 'parent_kw': ['行业类别','所在行业'],
         'value': '互联网/IT', 'unique': True, 'key': 'industry', 'only_select': True},
        {'label_re': r'(?:工作地点|工作城市|工作所在地)', 'parent_kw': ['工作地点','工作所在地'],
         'value': RESUME['currentCity'], 'unique': False, 'key': 'workCity', 'only_select': True},
    ]
    return rules

def test_field(field, rule):
    """测试一个字段是否匹配一条规则"""
    if rule.get('only_select') and field.get('type') not in ('select','dropdown','custom-select','input-dropdown'):
        return False
    if 'label_re' in rule:
        for attr in ['label', 'placeholder']:
            val = field.get(attr, '')
            if val and re.search(rule['label_re'], val):
                return True
    if 'name_re' in rule:
        for attr in ['name', 'id']:
            val = field.get(attr, '')
            if val and re.search(rule['name_re'], val):
                return True
    if 'class_re' in rule:
        cls = field.get('class', '')
        if cls and re.search(rule['class_re'], cls):
            return True
    if 'parent_kw' in rule:
        label = field.get('label', '')
        if not label or label in ('请选择','请输入','') or len(label) <= 3:
            parent = field.get('parent_context', '')
            for kw in rule['parent_kw']:
                if kw in parent:
                    return True
    return False

def is_date_field(field):
    cls = field.get('class', '').lower()
    if re.search(r'required-year|required-month|year|month|date-?picker|calendar', cls):
        return True
    lbl = field.get('label', '').strip()
    if re.match(r'^(年|月|开始时间|结束时间|起始时间|起止时间)$', lbl):
        return True
    ph = field.get('placeholder', '').strip()
    if re.search(r'请选择.*时间|请选择.*日期|选择开始|选择结束', ph):
        return True
    return False


# 三个站点的字段定义
BYTEDANCE_FIELDS = [
    # 基本信息
    {'label': '姓名', 'name': 'name', 'id': 'formily-item-name', 'type': 'text', 'class': 'ud__native-input'},
    {'label': '手机号码', 'name': 'mobile', 'id': 'formily-item-mobile', 'type': 'text', 'class': 'ud__input'},
    {'label': '邮箱', 'name': 'email', 'id': 'formily-item-email', 'type': 'text', 'class': 'ud__native-input'},
    {'label': '个人证件', 'name': 'identification', 'id': 'formily-item-identification', 'type': 'text', 'class': 'ud__input', 'parent_context': '个人证件 证件号码'},
    {'label': '期望工作地点', 'name': 'preferred_city_list', 'id': 'formily-item-preferred_city_list', 'type': 'input-dropdown', 'class': 'ud__select'},
    # 教育经历
    {'label': '起止时间', 'name': 'start_end_time', 'type': 'custom-select', 'class': 'throne-biz-date-range-picker', 'parent_context': '教育经历 起止时间'},
    {'label': '学历类型', 'name': 'education_type', 'type': 'input-dropdown', 'class': 'ud__select', 'parent_context': '教育经历 学历类型'},
    {'label': '学校名称', 'name': 'school', 'type': 'input-dropdown', 'class': 'ud__select', 'parent_context': '教育经历 学校名称'},
    {'label': '学历', 'name': 'degree', 'type': 'input-dropdown', 'class': 'ud__select', 'parent_context': '教育经历 学历'},
    {'label': '学院', 'name': '', 'type': 'text', 'class': 'ud__input', 'parent_context': '教育经历 学院'},
    {'label': '专业', 'name': 'field_of_study', 'type': 'text', 'class': 'ud__input', 'parent_context': '教育经历 专业'},
    {'label': '实验室', 'name': '', 'type': 'text', 'class': 'ud__input', 'parent_context': '教育经历 实验室'},
    {'label': '领域方向', 'name': '', 'type': 'text', 'class': 'ud__input', 'parent_context': '教育经历 领域方向'},
    {'label': '导师', 'name': '', 'type': 'text', 'class': 'ud__input', 'parent_context': '教育经历 导师'},
    # 实习经历
    {'label': '公司名称', 'name': 'company', 'type': 'text', 'class': 'ud__input', 'parent_context': '实习经历 公司名称'},
    {'label': '职位名称', 'name': 'title', 'type': 'text', 'class': 'ud__input', 'parent_context': '实习经历 职位名称'},
    {'label': '起止时间', 'name': 'start_end_time', 'type': 'custom-select', 'class': 'throne-biz-date-range-picker', 'parent_context': '实习经历 起止时间'},
    {'label': '描述', 'name': 'desc', 'type': 'textarea', 'class': 'ud__textarea', 'parent_context': '实习经历 描述'},
    # 工作经历
    {'label': '公司名称', 'name': 'company', 'type': 'text', 'class': 'ud__input', 'parent_context': '工作经历 公司名称'},
    {'label': '职位名称', 'name': 'title', 'type': 'text', 'class': 'ud__input', 'parent_context': '工作经历 职位名称'},
    {'label': '起止时间', 'name': 'start_end_time', 'type': 'custom-select', 'class': 'throne-biz-date-range-picker', 'parent_context': '工作经历 起止时间'},
    {'label': '描述', 'name': 'desc', 'type': 'textarea', 'class': 'ud__textarea', 'parent_context': '工作经历 描述'},
]

BAIDU_FIELDS = [
    # 基础信息
    {'label': '姓名', 'name': 'name', 'type': 'text', 'placeholder': '请输入真实姓名', 'class': 'resume-helper-filled'},
    {'label': '性别', 'name': '', 'type': 'select', 'class': 'brick-radio', 'parent_context': '性别 男 女 保密'},
    {'label': '移动电话', 'name': 'mobile', 'type': 'text', 'placeholder': '请输入大陆11位手机号码', 'class': ''},
    {'label': '电子邮箱', 'name': 'email', 'type': 'text', 'placeholder': '请填写常用个人邮箱', 'class': ''},
    {'label': '国籍/地区', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '国籍/地区'},
    {'label': '目标工作城市', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '目标工作城市'},
    {'label': '目标职位类别', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '目标职位类别'},
    {'label': '可面试方式', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '可面试方式'},
    # 教育经历
    {'label': '学校', 'name': '', 'id': 'rc_select_0', 'type': 'input-dropdown', 'class': 'ant-select', 'parent_context': '教育经历 学校'},
    {'label': '专业', 'name': '', 'id': 'rc_select_1', 'type': 'input-dropdown', 'class': 'ant-select', 'parent_context': '教育经历 专业'},
    {'label': '学历', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '教育经历 学历'},
    {'label': '', 'name': '', 'type': 'text', 'placeholder': '请选择开始时间', 'class': 'brick-date-picker', 'parent_context': '教育经历 起止时间'},
    {'label': '', 'name': '', 'type': 'text', 'placeholder': '请选择结束时间', 'class': 'brick-date-picker', 'parent_context': '教育经历 起止时间'},
    # 工作经历
    {'label': '企业名称', 'name': 'companyName0', 'type': 'text', 'placeholder': '请输入', 'class': ''},
    {'label': '所在部门', 'name': 'department0', 'type': 'text', 'placeholder': '请输入', 'class': ''},
    {'label': '职位名称', 'name': 'positionName0', 'type': 'text', 'placeholder': '请输入', 'class': ''},
    {'label': '行业类别', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '工作经历 行业类别'},
    {'label': '职位年薪', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '工作经历 职位年薪'},
    {'label': '工作地点', 'name': '', 'type': 'select', 'class': 'brick-select', 'parent_context': '工作经历 工作地点'},
    {'label': '', 'name': '', 'type': 'text', 'placeholder': '请选择开始时间', 'class': 'brick-date-picker', 'parent_context': '工作经历 起止时间'},
    {'label': '', 'name': '', 'type': 'text', 'placeholder': '请选择结束时间', 'class': 'brick-date-picker', 'parent_context': '工作经历 起止时间'},
    {'label': '工作描述', 'name': 'workDesc0', 'type': 'textarea', 'placeholder': '请输入', 'class': ''},
    # 项目经验
    {'label': '项目名称', 'name': 'subjectName0', 'type': 'text', 'placeholder': '请输入', 'class': ''},
    {'label': '项目职务', 'name': 'position0', 'type': 'text', 'placeholder': '请输入', 'class': '', 'parent_context': '项目经验 项目职务'},
    {'label': '项目描述', 'name': 'subjectDesc0', 'type': 'textarea', 'placeholder': '请输入', 'class': ''},
    {'label': '项目职责', 'name': 'positionDesc0', 'type': 'textarea', 'placeholder': '请输入', 'class': '', 'parent_context': '项目经验 项目中职责'},
    {'label': '', 'name': '', 'type': 'text', 'placeholder': '请选择开始时间', 'class': 'brick-date-picker', 'parent_context': '项目经验 起止时间'},
    {'label': '', 'name': '', 'type': 'text', 'placeholder': '请选择结束时间', 'class': 'brick-date-picker', 'parent_context': '项目经验 起止时间'},
    # 作品集
    {'label': '作品描述', 'name': 'portfolioDesc', 'type': 'text', 'placeholder': '请输入', 'class': ''},
    {'label': '作品链接', 'name': 'portfolioAddress', 'type': 'text', 'placeholder': '请输入', 'class': ''},
]

TENCENT_FIELDS = [
    # 联系信息
    {'label': '姓名', 'name': '', 'type': 'text', 'class': 'input required', 'parent_context': '联系信息 姓名'},
    {'label': '当前居住国家/地区', 'name': '', 'type': 'text', 'class': 'country-input country-required', 'placeholder': '选择国家/地区', 'parent_context': '联系信息 当前居住国家/地区'},
    {'label': '当前居住省/市', 'name': '', 'type': 'text', 'class': 'input-short optional-input', 'placeholder': '省/市', 'parent_context': '联系信息 当前居住省/市'},
    {'label': '区号', 'name': '', 'type': 'text', 'class': 'telephone-region required', 'placeholder': '请输入', 'parent_context': '联系信息 手机号码'},
    {'label': '手机号码', 'name': '', 'type': 'text', 'class': 'splicing-input telephone-input required', 'parent_context': '联系信息 手机号码'},
    {'label': '电子邮箱', 'name': '', 'id': 'e-mail', 'type': 'text', 'class': 'input e-mail-input required', 'parent_context': '联系信息 电子邮箱'},
    # 工作意向
    {'label': '期望工作国家/地区', 'name': '', 'type': 'text', 'class': 'country-input expectWorkCountry-required', 'placeholder': '请选择国家/地区', 'parent_context': '工作意向 期望工作国家/地区'},
    {'label': '期望工作城市', 'name': '', 'type': 'input-dropdown', 'class': 'el-select custom-selected', 'placeholder': '请选择城市', 'parent_context': '工作意向 期望工作城市'},
    # 工作经验
    {'label': '工作职位', 'name': '', 'id': 'work', 'type': 'text', 'class': 'input required', 'parent_context': '工作经验 工作职位'},
    {'label': '公司名称', 'name': '', 'id': 'company', 'type': 'text', 'class': 'input required', 'parent_context': '工作经验 公司名称'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-left short-down-icon required-year', 'parent_context': '工作经验 开始时间 年'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-right splicing-down-icon required-month', 'parent_context': '工作经验 开始时间 月'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-left short-down-icon required-year', 'parent_context': '工作经验 结束时间 年'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-right splicing-down-icon required-month', 'parent_context': '工作经验 结束时间 月'},
    {'label': '工作描述', 'name': '', 'type': 'textarea', 'class': 'describe-input required', 'parent_context': '工作经验 工作描述'},
    # 学历
    {'label': '学校', 'name': '', 'id': 'school', 'type': 'text', 'class': 'input school-input required', 'parent_context': '学历 学校'},
    {'label': '专业', 'name': '', 'type': 'text', 'class': 'input-short required', 'parent_context': '学历 专业'},
    {'label': '学历', 'name': '', 'type': 'select', 'class': 'education-select education-required', 'placeholder': '选择学历', 'parent_context': '学历'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-left short-down-icon required-year', 'parent_context': '学历 开始时间 年'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-right splicing-down-icon required-month', 'parent_context': '学历 开始时间 月'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-left short-down-icon required-year', 'parent_context': '学历 结束时间 年'},
    {'label': '', 'name': '', 'type': 'select', 'class': 'select-right splicing-down-icon required-month', 'parent_context': '学历 结束时间 月'},
    # 补充信息
    {'label': '自我评价或其他补充信息', 'name': '', 'type': 'textarea', 'class': 'describe-input', 'parent_context': '补充信息 自我评价'},
    # 作品链接
    {'label': '作品链接', 'name': '', 'type': 'text', 'class': 'el-input__inner', 'parent_context': '作品链接'},
    # 个人主页
    {'label': '个人主页链接', 'name': '', 'type': 'text', 'class': 'el-input__inner', 'parent_context': '个人主页链接'},
]


def analyze_site(site_name, fields):
    rules = build_rules()
    matched = {}
    used_keys = {}
    non_unique_count = {}
    date_matched = 0

    for i, field in enumerate(fields):
        if is_date_field(field):
            date_matched += 1
            matched[i] = 'DATE_AUTO'
            continue

        for rule in rules:
            rkey = rule['key']
            if rule['unique'] and rkey in used_keys:
                continue
            if not rule['unique'] and non_unique_count.get(rkey, 0) >= 1:
                name_hit = 'name_re' in rule and any(re.search(rule['name_re'], field.get(a,'')) for a in ['name','id'] if field.get(a,''))
                label_hit = 'label_re' in rule and any(re.search(rule['label_re'], field.get(a,'')) for a in ['label','placeholder'] if field.get(a,''))
                if not name_hit and not label_hit:
                    continue
            if not rule.get('value'):
                continue
            if test_field(field, rule):
                matched[i] = rkey
                if rule['unique']:
                    used_keys[rkey] = True
                else:
                    non_unique_count[rkey] = non_unique_count.get(rkey, 0) + 1
                break

    total = len(fields)
    matched_count = len(matched)
    unmatched = []
    for i, f in enumerate(fields):
        if i not in matched:
            unmatched.append(f)

    pct = matched_count / total * 100 if total > 0 else 0
    print(f"\n{'='*60}")
    print(f"  {site_name}")
    print(f"{'='*60}")
    print(f"  总字段数: {total}")
    print(f"  规则匹配: {matched_count} ({pct:.1f}%)")
    print(f"  日期自动: {date_matched}")
    print(f"  未匹配:   {total - matched_count}")

    if matched:
        print(f"\n  已匹配字段:")
        for i in sorted(matched.keys()):
            f = fields[i]
            label = f.get('label','') or f.get('placeholder','') or '(无label)'
            print(f"    ✅ [{i}] {label} → {matched[i]}")

    if unmatched:
        print(f"\n  未匹配字段:")
        for f in unmatched:
            label = f.get('label','') or f.get('placeholder','') or '(无label)'
            print(f"    ❌ {label} (name={f.get('name','')}, class={f.get('class','')[:30]})")

    return pct


if __name__ == '__main__':
    print("=" * 60)
    print("  简历投递助手 - 三站点规则覆盖率分析")
    print("=" * 60)

    results = {}
    results['字节跳动'] = analyze_site('字节跳动', BYTEDANCE_FIELDS)
    results['百度'] = analyze_site('百度', BAIDU_FIELDS)
    results['腾讯'] = analyze_site('腾讯', TENCENT_FIELDS)

    print(f"\n{'='*60}")
    print(f"  汇总")
    print(f"{'='*60}")
    for name, pct in results.items():
        status = '✅' if pct >= 90 else '❌'
        print(f"  {status} {name}: {pct:.1f}%")
