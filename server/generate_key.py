#!/usr/bin/env python3
"""
简历投递助手 - 密钥管理工具

用法：
    python generate_key.py create [--name 名称]    创建新密钥
    python generate_key.py list                    列出所有密钥
    python generate_key.py deactivate <密钥>       停用指定密钥
    python generate_key.py stats                   显示密钥使用统计
"""

import argparse
import os
import sqlite3
import secrets
from datetime import datetime

DATA_DIR = '/opt/resume-backend/data'
DB_FILE = os.path.join(DATA_DIR, 'resume_helper.db')


def get_db():
    if not os.path.exists(DB_FILE):
        print(f'错误: 数据库文件不存在 ({DB_FILE})')
        print('请先启动后端服务 (python app.py) 以初始化数据库')
        exit(1)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def create_key(name='unnamed'):
    new_key = 'rh-' + secrets.token_hex(16)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        'INSERT INTO api_keys (key, name, created, active) VALUES (?, ?, ?, 1)',
        (new_key, name, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    print(f'密钥已创建:')
    print(f'  密钥: {new_key}')
    print(f'  名称: {name}')
    print(f'  状态: 有效')
    return new_key


def list_keys():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT key, name, created, active, last_used, usage_count FROM api_keys ORDER BY created DESC')
    rows = c.fetchall()
    conn.close()

    if not rows:
        print('暂无密钥')
        return

    print(f'共 {len(rows)} 个密钥:\n')
    print(f'{"密钥":<42} {"名称":<12} {"状态":<6} {"使用次数":<8} {"最后使用":<20}')
    print('-' * 90)
    for row in rows:
        status = '有效' if row['active'] else '已停用'
        last_used = row['last_used'][:19] if row['last_used'] else '从未使用'
        print(f'{row["key"]:<42} {row["name"]:<12} {status:<6} {row["usage_count"] or 0:<8} {last_used:<20}')


def deactivate_key(key):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT active FROM api_keys WHERE key = ?', (key,))
    row = c.fetchone()
    if not row:
        print(f'错误: 密钥不存在 ({key})')
        conn.close()
        return
    if not row['active']:
        print(f'密钥已经是停用状态 ({key})')
        conn.close()
        return
    c.execute('UPDATE api_keys SET active = 0 WHERE key = ?', (key,))
    conn.commit()
    conn.close()
    print(f'密钥已停用: {key}')


def show_stats():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count, SUM(usage_count) as total_usage FROM api_keys')
    row = c.fetchone()
    conn.close()

    print(f'密钥统计:')
    print(f'  总数: {row["total"]}')
    print(f'  有效: {row["active_count"]}')
    print(f'  已停用: {row["total"] - row["active_count"]}')
    print(f'  总使用次数: {row["total_usage"] or 0}')


def main():
    parser = argparse.ArgumentParser(description='简历投递助手 - 密钥管理工具')
    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    create_parser = subparsers.add_parser('create', help='创建新密钥')
    create_parser.add_argument('--name', default='unnamed', help='密钥名称/备注')

    subparsers.add_parser('list', help='列出所有密钥')

    deactivate_parser = subparsers.add_parser('deactivate', help='停用指定密钥')
    deactivate_parser.add_argument('key', help='要停用的密钥')

    subparsers.add_parser('stats', help='显示密钥使用统计')

    args = parser.parse_args()

    if args.command == 'create':
        create_key(args.name)
    elif args.command == 'list':
        list_keys()
    elif args.command == 'deactivate':
        deactivate_key(args.key)
    elif args.command == 'stats':
        show_stats()
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
