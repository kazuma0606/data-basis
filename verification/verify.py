"""
テクノマート 汚れデータ検証スクリプト

生成されたデータが設計通りの「汚れ」を持っているかを確認する。

使い方:
    uv run python verify.py
"""
import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

import sqlite3
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich import box

console = Console()
DB_PATH = Path(__file__).parent / 'technomart.db'


def section(title: str) -> None:
    console.print(f'\n[bold yellow]── {title} ──[/bold yellow]')


def tbl(headers: list[tuple[str, str]], rows: list[tuple]) -> Table:
    """headers は (列名, 'right'|'cyan'|'') の形式。'right' は justify 指定。"""
    t = Table(box=box.SIMPLE)
    for name, hint in headers:
        if hint == 'right':
            t.add_column(name, justify='right')
        else:
            t.add_column(name, style=hint or '')
    for row in rows:
        t.add_row(*[str(v) for v in row])
    return t


def main() -> None:
    if not DB_PATH.exists():
        console.print('[red]technomart.db が見つかりません。先に generate.py を実行してください。[/red]')
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    console.print('\n[bold cyan]テクノマート データ検証レポート[/bold cyan]')

    # ── 1. テーブル行数 ──────────────────────────────────
    section('テーブル行数')
    tables = [
        'master_categories', 'master_products', 'master_stores',
        'ec_customers', 'pos_members', 'app_users',
        'ec_orders', 'ec_order_items', 'ec_browsing_events',
        'pos_transactions', 'pos_transaction_items', 'pos_store_visits',
        'app_events',
    ]
    rows = [(t, f'{conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:,}') for t in tables]
    console.print(tbl([('テーブル', 'cyan'), ('件数', 'right')], rows))

    # ── 2. チャーン分布 ──────────────────────────────────
    section('チャーン分布（_unified_links）')
    total = conn.execute('SELECT COUNT(DISTINCT true_person_id) FROM _unified_links').fetchone()[0]
    rows = conn.execute("""
        SELECT churn_status, COUNT(DISTINCT true_person_id)
        FROM _unified_links
        GROUP BY churn_status
        ORDER BY CASE churn_status
            WHEN 'active' THEN 1 WHEN 'dormant' THEN 2
            WHEN 'churned' THEN 3 ELSE 4 END
    """).fetchall()
    console.print(tbl(
        [('ステータス', 'cyan'), ('人数', 'right'), ('割合', 'right')],
        [(s, f'{c:,}', f'{c/total*100:.1f}%') for s, c in rows],
    ))

    # ── 3. システム横断の重複（名寄せ対象） ──────────────
    section('クロスシステム重複（名寄せ対象）')
    rows = conn.execute("""
        SELECT combo, COUNT(*) as cnt
        FROM (
            SELECT true_person_id,
                   GROUP_CONCAT(system, '+') as combo
            FROM (SELECT true_person_id, system FROM _unified_links ORDER BY system)
            GROUP BY true_person_id
        )
        GROUP BY combo
        ORDER BY cnt DESC
    """).fetchall()
    console.print(tbl(
        [('システム組み合わせ', 'cyan'), ('人数', 'right')],
        [(combo, f'{cnt:,}') for combo, cnt in rows],
    ))
    multi = sum(cnt for combo, cnt in rows if '+' in combo)
    console.print(f'  → 複数システムに存在する人物（名寄せ対象）: [bold green]{multi:,} 人[/bold green]')

    # ── 4. 電話番号フォーマット分布 ──────────────────────
    section('電話番号フォーマット分布（ec_customers）')
    rows = conn.execute("""
        SELECT
            CASE
                WHEN phone = ''                           THEN '① 欠損'
                WHEN phone LIKE '+81%'                   THEN '② +81-XX-XXXX-XXXX'
                WHEN phone LIKE '%（携帯）%'             THEN '③ 0XX-XXXX-XXXX（携帯）'
                WHEN phone LIKE '0__-____-____'          THEN '④ 0XX-XXXX-XXXX（標準）'
                WHEN phone LIKE '0%' AND phone NOT LIKE '%-%' THEN '⑤ 0XXXXXXXXXXX（ハイフンなし）'
                ELSE '⑥ その他'
            END as fmt,
            COUNT(*) as cnt
        FROM ec_customers
        GROUP BY fmt
        ORDER BY fmt
    """).fetchall()
    console.print(tbl([('フォーマット', 'cyan'), ('件数', 'right')], rows))

    # ── 5. 和暦日付分布（POS） ───────────────────────────
    section('生年月日の和暦分布（pos_members）')
    rows = conn.execute("""
        SELECT
            CASE
                WHEN birth_date_jp LIKE 'S%' THEN '昭和 (S__)'
                WHEN birth_date_jp LIKE 'H%' THEN '平成 (H__)'
                WHEN birth_date_jp LIKE 'R%' THEN '令和 (R_)'
                ELSE 'その他'
            END as era,
            COUNT(*) as cnt
        FROM pos_members
        GROUP BY era
        ORDER BY era
    """).fetchall()
    console.print(tbl([('元号', 'cyan'), ('件数', 'right')], rows))

    sample = conn.execute(
        "SELECT name_kana, birth_date_jp FROM pos_members LIMIT 5"
    ).fetchall()
    console.print('  サンプル（POS）:')
    for name, era in sample:
        console.print(f'    {name} / {era}')

    # ── 6. 都道府県フォーマット分布 ──────────────────────
    section('都道府県フォーマット分布（ec_customers）')
    rows = conn.execute("""
        SELECT
            CASE
                WHEN prefecture LIKE '%都' OR prefecture LIKE '%道'
                  OR prefecture LIKE '%府' OR prefecture LIKE '%県'
                                             THEN '① 正式名称（東京都 等）'
                WHEN prefecture GLOB '[0-9]*' THEN '② 数字コード（13 等）'
                ELSE                               '③ 略称（東京 等）'
            END as fmt,
            COUNT(*) as cnt
        FROM ec_customers
        GROUP BY fmt
        ORDER BY fmt
    """).fetchall()
    console.print(tbl([('フォーマット', 'cyan'), ('件数', 'right')], rows))

    # ── 7. 退会処理漏れ ──────────────────────────────────
    section('退会処理漏れ（チャーン/デッド顧客なのに is_deleted=0）')
    churned_ec = conn.execute("""
        SELECT COUNT(*) FROM ec_customers ec
        JOIN _unified_links ul
          ON ul.system = 'ec' AND ul.system_id = CAST(ec.ec_user_id AS TEXT)
        WHERE ul.churn_status IN ('churned', 'dead')
    """).fetchone()[0]
    leaked = conn.execute("""
        SELECT COUNT(*) FROM ec_customers ec
        JOIN _unified_links ul
          ON ul.system = 'ec' AND ul.system_id = CAST(ec.ec_user_id AS TEXT)
        WHERE ul.churn_status IN ('churned', 'dead') AND ec.is_deleted = 0
    """).fetchone()[0]
    console.print(
        f'  チャーン・デッド顧客 {churned_ec:,} 件中 '
        f'[red bold]{leaked:,} 件[/red bold] が is_deleted=0 のまま残存'
        f'（{leaked/churned_ec*100:.1f}%）'
    )

    # ── 8. 名寄せ候補（電話番号正規化マッチ） ────────────
    section('名寄せ候補（EC-POS 間で電話番号が一致）')
    matched = conn.execute("""
        SELECT COUNT(*) FROM ec_customers ec
        JOIN pos_members pos ON
            REPLACE(REPLACE(REPLACE(ec.phone,  '-', ''), '（携帯）', ''), '+81', '0') =
            REPLACE(REPLACE(REPLACE(pos.phone, '-', ''), '（携帯）', ''), '+81', '0')
        WHERE ec.phone != '' AND pos.phone != ''
    """).fetchone()[0]
    console.print(
        f'  電話番号（正規化後）が一致する EC-POS ペア: '
        f'[green bold]{matched:,} 件[/green bold]'
    )
    console.print('  → これが名寄せパイプラインの入力候補になります')

    # ── 9. 商品コード体系の差異 ──────────────────────────
    section('商品コード体系（正マスタ vs EC vs POS）')
    rows = conn.execute("""
        SELECT m.product_id, m.name, e.ec_product_code, p.pos_product_code
        FROM master_products m
        JOIN ec_products  e ON e.master_product_id = m.product_id
        JOIN pos_products p ON p.master_product_id = m.product_id
        LIMIT 6
    """).fetchall()
    console.print(tbl(
        [('正マスタID', 'right'), ('商品名', 'cyan'), ('ECコード', ''), ('POSコード', '')],
        [(str(pid), name[:22], ec, pos) for pid, name, ec, pos in rows],
    ))

    # ── 10. 古いメールアドレス（バウンス候補） ───────────
    section('古いメールアドレス（バウンス候補）')
    old_domains = conn.execute("""
        SELECT
            CASE
                WHEN email LIKE '%docomo.ne.jp'   THEN 'docomo.ne.jp'
                WHEN email LIKE '%ezweb.ne.jp'    THEN 'ezweb.ne.jp'
                WHEN email LIKE '%softbank.ne.jp' THEN 'softbank.ne.jp'
                WHEN email LIKE '%i.softbank.jp'  THEN 'i.softbank.jp'
                ELSE 'その他'
            END as domain,
            COUNT(*) as cnt
        FROM ec_customers
        WHERE email LIKE '%docomo.ne.jp' OR email LIKE '%ezweb.ne.jp'
           OR email LIKE '%softbank.ne.jp' OR email LIKE '%i.softbank.jp'
        GROUP BY domain
        ORDER BY cnt DESC
    """).fetchall()
    total_ec = conn.execute('SELECT COUNT(*) FROM ec_customers').fetchone()[0]
    old_total = sum(cnt for _, cnt in old_domains)
    console.print(tbl(
        [('キャリアメール', 'cyan'), ('件数', 'right')],
        [(d, f'{c:,}') for d, c in old_domains],
    ))
    console.print(
        f'  EC顧客 {total_ec:,} 件中 [yellow]{old_total:,} 件[/yellow]'
        f'（{old_total/total_ec*100:.1f}%）がキャリアメール（バウンスリスク）'
    )

    conn.close()
    console.print('\n[dim]── 検証完了。このDBはデータ基盤の名寄せ・クレンジングパイプライン検証用です ──[/dim]\n')


if __name__ == '__main__':
    main()
