# Project Memory: mymag

## Purpose

このプロジェクトの目的は、`metadata/` 内の MADB JSON-LD データセットと仕様書を解析し、マンガ関連を中心に以下のリストを作成・整備すること。

- 出版社
- 著者・作者
- 単行本
- 雑誌
- 雑誌タイトル単位の情報

特に、単純なタイトル一覧ではなく、読み方、出版社、著者、レーベル、刊行頻度、創刊日候補、ジャンル、サブジャンルに相当する周辺情報をなるべく多く残した形でまとめる。

## Source Data

- 元データは `metadata/metadata_all_*.json`
- 仕様書は `metadata/MADBメタデータスキーマ仕様書（Ver.1.0）.pdf`
- JSON は JSON-LD 形式で、各ファイルは `@context` と `@graph` を持つ
- `@graph` 内の各ノードは `@id` を持つことが多く、`isPartOf` や `relatedItem` などで別ノードに接続される
- 元データは直接編集しない
- `metadata_all_00009.json` は未エスケープ制御文字が含まれるため、読み込み時に制御文字を空白化して扱う

## Domain Mapping

- `class:CM`: マンガ
- `class:AN`: アニメ
- `class:GM`: ゲーム
- `class:MA`: メディアアート
- `class:CO`: キュレーション、責任主体

## Important Genre Rules

- `genre=単行本`: 単行本の個別資料
- `genre=単行本全巻`: 単行本シリーズ、または全巻単位のコレクション
- `genre=雑誌巻号`: 雑誌の各号
- `genre=雑誌掲載`: 雑誌掲載作品・掲載単位
- `genre=雑誌全号`: 雑誌タイトル単位。例: `週刊少年ジャンプ`

`雑誌全号` は「何月号」という個別の一冊ではなく、雑誌名そのものの一覧として扱う。

## Generated Files

主な変換スクリプト:

- `scripts/metadata_to_tables.py`
- `scripts/extract_core_lists.py`

主な生成物:

- `converted/core_lists/publishers.csv`
- `converted/core_lists/authors.csv`
- `converted/core_lists/books.csv`
- `converted/core_lists/magazines.csv`
- `converted/core_lists/magazine_titles.csv`

整形済み生成物:

- `converted/cleaned/publishers_clean.csv`
- `converted/cleaned/authors_clean.csv`
- `converted/cleaned/books_clean.csv`
- `converted/cleaned/magazine_titles_clean.csv`
- `converted/cleaned/magazine_issues_clean.csv`

正式なマスターデータ:

- `master_data/books.csv`
- `master_data/authors.csv`
- `master_data/magazine_titles.csv`
- `master_data/publishers.csv`

この4ファイルを、本・著者・雑誌タイトル・出版社のマスターデータとして扱う。`converted/cleaned/` は再生成元・作業用の整形済み出力として残す。

整形スクリプト:

- `scripts/clean_core_lists.py`

補助的な試験変換:

- `converted/sample/nodes.csv`
- `converted/sample/edges.csv`
- `converted/sample/names.csv`

## Extraction Policy

出版社は以下の項目を中心に抽出する。

- `publisher`
- `schema:publisher`
- `dcterms:publisher`
- `ma:publisher`

著者・作者は以下の項目を中心に抽出する。

- `creator`
- `schema:creator`
- `ma:creator`
- `dcterms:creator`

名称・読みは、文字列と `{"@language": "ja-hrkt", "@value": "..."}` が混在する。読み仮名は別列へ寄せる。

整形済み CSV の `_reading` 列は検索用として扱う。カタカナはひらがなへ変換し、半角スペース、全角スペース、カンマ、スラッシュ、英字などは残さない。原則として、ひらがなと長音符だけを残す。

`P4060000000` のような出版社 ID 形式の値と、`講談社 ∥ コウダンシャ` のような出版社名文字列が混在する。情報を落とさず保持し、必要に応じて後工程で名寄せする。

出版社名に `小学館,小学館` のような同一名の連続がある場合は、1つにまとめる。

## Magazine Title List

`converted/cleaned/magazine_titles_clean.csv` は `genre=雑誌全号` のみを抽出した雑誌タイトル単位のリスト。

主な列:

- `magazine_id`: MADB ID の末尾のみ。例: `C119459`
- `title`: 雑誌名
- `title_reading`: 検索用のひらがな読み
- `publisher_ids`: 取れる範囲で役割つき JSON。例: `{"発行":["P4080000000"]}`
- `publisher_name`: 出版社
- `first_published_date`: 創刊日候補
- `publication_frequency`: 刊行頻度。英語注記は削除し、JSON配列で出力する。例: `["月刊"]`, `["月刊","月2回刊"]`
- `issn`
- `jpno`
- `mtid`
- `last_published_date`: 最終発行日候補
- `final_volume_number`
- `final_issue_number`
- `note`: 備考

例: `週刊少年ジャンプ` は `magazine_titles.csv` に存在し、出版社は `集英社`、創刊日候補は `1969-11-03`、刊行頻度は `週刊`。

`identifier`, `location`, `language`, `publisher_reading` は出力しない。

## Clean Authors

`converted/cleaned/authors_clean.csv` は著者マスタとして扱う。

列は以下に絞る。

- `author_id`: MADB ID の末尾のみ。例: `C48012`
- `author_name`: 著者名
- `author_reading`: 検索用のひらがな読み

`author_id` がない行、または `author_name` がない行は除外する。読みはカタカナをひらがなへ変換し、ローマ字だけの読みや英字混入部分は検索用読みとして残さない。

## Clean Publishers

`converted/cleaned/publishers_clean.csv` は出版社マスタとして扱う。

列は以下を基本とする。

- `publisher_id`: `P*****` 形式の出版社 ID。複数候補がある場合は最初の1つだけを残す
- `publisher_name`: 出版社名
- `publisher_reading`: 検索用のひらがな読み
- `address`
- `url`
- `related_link`
- `start_date`
- `end_date`
- `description`

`publisher_key`, `publisher_ids`, `source_count`, `genres`, `fields`, `country_of_origin` は出力しない。`P*****` 形式の ID がない行は、出版社マスタから除外する。

## Clean Books

`converted/cleaned/books_clean.csv` は本1冊単位の単行本リストとして扱う。

対象は `genre=単行本` のみ。`genre=単行本全巻` は含めない。

主な方針:

- `book_id` は MADB ID の末尾のみ。例: `M200125`
- `identifier` と `type` は出力しない
- `publisher_ids` は取れる範囲で役割つき JSON にする。例: `{"発行":["P4834200000"],"発売":["P4080000000"]}`
- 出版社名しかない場合は `publisher_name` に残す
- `publisher_name` は表示用。複数社の場合は `ホーム社 | 発売: 集英社` のように役割つきで残す
- `ホーム社,[発売]集英社,ホーム社` のような意味のない重複は `ホーム社 | 発売: 集英社` にまとめる
- 同じ出版社 ID が `発行` と `発売` など複数役割に重複する場合は、代表して `発行` に寄せる
- `publisher_reading`, `author_readings`, `author_roles`, `location`, `language` は出力しない
- `authors` は役割つきの表示用文字列として残す。例: `原作: 大崎悌造 | 作画: TOMI`
- `author_ids` は取れる範囲で役割つき JSON にする。例: `{"原作":["C56119"],"作画":["C57066"]}`
- 著者 ID と役割の対応が不確かな場合は、無理に補完せず、取れる範囲だけ `author_ids` に入れる
- `author_ids` が空の場合は、`authors_clean.csv` の `author_name` と完全な正規化一致を試みる。同名候補が1つだけの場合のみ `author_ids` を補完する。同名で複数 ID がある場合は誤補完を避けるため補完しない

## Clean Magazine Issues

`converted/cleaned/magazine_issues_clean.csv` は雑誌各号、つまり雑誌1冊単位のリストとして扱う。

主な方針:

- `issue_id` は MADB ID の末尾のみ。例: `M537976`
- `identifier` は出力しない
- `magazine_id` は親の雑誌タイトル ID。MADB ID の末尾のみ。例: `C119033`
- `location`, `language`, `publisher_reading` は出力しない
- `publisher_ids` は取れる範囲で役割つき JSON にする。例: `{"発行":["P4060000000"]}`
- `publisher_name` は出版社 ID が取れない場合や確認用の表示名として残す
- `_reading` 列は検索用としてひらがなだけに整形する

## Working Style

- 解析結果は、根拠となるファイル名・列名・抽出条件を明記する
- 大きな変換は再現可能なスクリプトとして残す
- CSV 出力は UTF-8 とする
- 途中生成物を作る場合は `converted/` 配下へ置く
- 分析や確認には、まず `converted/cleaned/` 配下の整形済み CSV を使う
- 元の `metadata/` 配下の JSON/PDF は変更しない

## Application Goal

今後の目的は、完成した4つのマスターデータを管理し、追加、修正、閲覧できる総合書籍データベースシステムを構築すること。

ただし、ユーザーが明示的に開発開始を許可するまでは実装に入らない。まずは対話ベースで、システム設計、テーブル設計、入力フロー、権限、承認フロー、UI 方針を細かく詰めてから開発する。

最新のデータベース設計と入力・承認フローは `docs/database_design.md` にまとめる。このファイルを設計確認用の主ドキュメントとして扱う。

正式な初期マスターデータ:

- `master_data/books.csv`
- `master_data/authors.csv`
- `master_data/magazine_titles.csv`
- `master_data/publishers.csv`

作業用の `converted/cleaned/magazine_issues_clean.csv` は既存 MADB 由来の雑誌各号リストだが、今後の運用で作る `magazine_issues` テーブルとは別物として扱う。

## Planned Stack

現時点の有力案:

- Supabase/PostgreSQL をデータベースとして使う
- JSON を多く扱うため、PostgreSQL の `jsonb` を前提に設計する
- GitHub でコード管理する
- Vercel で Web 公開する

ユーザーは Supabase、GitHub、Vercel のアカウントを持っている。

## Users And Permissions

将来的には複数ユーザーで Web 公開する想定。

権限階層:

- `超管理者`: 最も広い管理権限を持つ
- `専門家`: 編集、追加、削除の申請ができる
- `閲覧者`: 閲覧のみできる

初期段階では、ほとんどの操作を超管理者が行う想定のため、認証は必須にしない。ただし将来のために、権限や承認フローを壊さない設計にする。

## Approval Workflow

編集、追加、削除はすべて承認制にする。

専門家が編集しても、承認されるまでは閲覧者には反映前のデータが見える。超管理者が承認すると、正式データへ反映される。

初期段階では認証なしでも、以下の流れを基本にする。

- 変更内容を `change_requests` のような申請データとして保存する
- 承認前は正式データを変更しない
- 承認後に正式テーブルへ反映する
- 超管理者が自分で編集する場合は、ストレスを減らすため「申請してすぐ承認」のようなショートカットを用意する
- それでも履歴と監査ログは残す

想定テーブル:

- `change_requests`
- `audit_logs`

`change_requests` の想定項目:

- `target_table`
- `target_id`
- `action`: `create`, `update`, `delete`
- `before_data`: JSON
- `after_data`: JSON
- `status`: `draft`, `submitted`, `approved`, `rejected`, `cancelled`
- `created_by`
- `approved_by`
- `created_at`
- `approved_at`
- `note`

## Core Application Tables

マスターテーブル:

- `books`
- `authors`
- `publishers`
- `magazine_titles`

追加する運用テーブル:

- `magazine_issues`
- `stories`
- `content_types`

管理用テーブル:

- `change_requests`
- `audit_logs`

## Magazine Issues Design

`magazine_issues` は、雑誌1冊単位の運用テーブル。既存 CSV の単純移行ではなく、今後の入力・編集を前提に新しく設計する。

ID は全体の方針に合わせて `MI0000001` のような形式にする。内部的には連番を持ち、表示・参照用に `magazine_issue_id` を使う。

想定項目:

- `magazine_issue_no`
- `magazine_issue_id`
- `source_issue_id`: MADB 由来の元 ID。初期は保持し、不要なら後で削除する
- `magazine_id`: 雑誌タイトル ID。例: `C119459`
- `issue_label`
- `media_format`: `print`, `digital`, `print_and_digital`, `unknown`
- `published_date`
- `year`
- `month`
- `day`
- `volume_number`
- `issue_number`
- `issue_number_displayed`
- `sub_issue_number`
- `publisher_ids`: JSON
- `publisher_name`
- `price`
- `size`
- `number_of_pages`
- `contents`: JSON
- `note`
- `created_at`
- `updated_at`

`media_format` は、紙、電子、紙+電子、不明を区別する。最近は途中から電子版になる雑誌もあるため、雑誌タイトルではなく雑誌各号に持たせる。

## Magazine Issue Contents

雑誌1冊のデータは、大きく分けて「雑誌そのものの情報」と「中身のコンテンツ」に分ける。

編集画面も以下に分ける。

- 雑誌情報編集画面
- コンテンツ編集画面

コンテンツ編集画面は、Excel のようなセルテーブル型を基本にする。行の順番はドラッグアンドドロップで入れ替えられるようにする。ライブ保存は望ましいが、正式データではなく申請中データ・ドラフトに保存する。

初期入力では、詳細なページ情報までは入れられない前提。まずは目次に近い軽い入力を優先する。

初期表示の基本列:

- `position`
- `content_type`
- `title`
- `authors`
- `note`

ページ開始、ページ終了、カラー詳細、細かい属性などは、初期 UI では隠し項目または詳細編集に回す。

コンテンツ JSON の想定:

```json
[
  {
    "position": 1,
    "content_type": "story",
    "title": "第1話",
    "authors": "尾田栄一郎",
    "contributors": [
      {"role": "著", "name": "尾田栄一郎", "author_id": "Cxxxxx"}
    ],
    "story_id": "S0000001",
    "page_start": null,
    "page_end": null,
    "attributes": {},
    "note": ""
  }
]
```

`content_id` は初期設計では持たない。必要になれば後から追加する。

1ページ内に目次と広告など複数コンテンツが混在する場合もあるため、ページ番号と行は一対一に固定しない。

カラー情報は複雑なため、固定列ではなく `attributes` に形式化して保存できるようにする。

例:

```json
{
  "color": "巻頭カラー",
  "color_detail": "冒頭4ページフルカラー、以降モノクロ",
  "digital_note": "電子版のみフルカラー"
}
```

## Stories Design

`stories` は、雑誌掲載だけでなく将来的に単行本の中身にも使うため、独立したテーブルにする。

`story_id` は自動付与にする。入力者は ID を気にしなくてよい。後から重複が見つかった場合は統合し、残す ID へ参照を寄せる。

ID は `S0000001` のような形式を想定する。

想定項目:

- `story_id`
- `story_type`: `serial`, `one_shot`, `extra`, `side_story`, `unknown`
- `series_title`
- `series_title_reading`
- `episode_number`: 表記用文字列。例: `第1話`, `1.5話`
- `episode_number_sort`: ソート用の数値。小数可
- `title`
- `title_reading`
- `subtitle`
- `subtitle_reading`
- `contributors`: JSON
- `page_count`
- `is_first_episode`
- `is_final_episode`
- `first_published_date`
- `first_magazine_issue_id`
- `status`: `active`, `draft`, `merged`, `deleted`
- `merged_into_story_id`
- `note`
- `created_at`
- `updated_at`

読み項目は検索用として、ひらがなに統一する。

## Content Types

`content_types` テーブルを作る。`magazine_issues.contents[].content_type` はこのテーブルから選択する。自由入力ではなく、必要なら `other` を使う。

想定項目:

- `content_type_id`
- `label`
- `description`
- `sort_order`
- `is_active`

初期候補:

- `story`: 漫画・単話
- `cover`: 表紙
- `toc`: 目次
- `advertisement`: 広告
- `article`: 記事
- `gravure`: グラビア
- `pinup`: ピンナップ
- `reader_page`: 読者ページ
- `preview`: 予告
- `announcement`: 告知
- `editorial_note`: 編集後記
- `prize`: 懸賞
- `appendix`: 付録
- `other`: その他

## Contributor Input

著者・作者入力は、原作、作画など複数人・複数役割のケースが多いため、1人入力と複数入力で UI を分ける。

1人の場合:

- 通常の入力欄で名前を入れる
- オートコンプリートで `authors` から候補を出す

複数の場合:

- ダイアログを開く
- `肩書` と `名前` の入力行を複数持つ
- `+` ボタンで行を追加する

内部保存形式:

```json
[
  {"role": "原作", "name": "武論尊", "author_id": "Cxxxxx"},
  {"role": "作画", "name": "原哲夫", "author_id": "Cyyyyy"}
]
```

役割候補:

- 著
- 作
- 画
- 作画
- 漫画
- 原作
- 脚本
- 構成
- 監修
- 協力
- キャラクター原案
- その他

選択候補を用意しつつ、自由入力も許可する。

## Autocomplete And Missing Masters

入力補完を重視する。

候補検索:

- 著者: `author_name`, `author_reading`, `author_id`
- 出版社: `publisher_name`, `publisher_reading`, `publisher_id`
- 雑誌タイトル: `title`, `title_reading`, `magazine_id`
- ストーリー: `title`, `title_reading`, `series_title`, `series_title_reading`, `story_id`
- コンテンツ種別: `content_types` から選択
- 役割: 候補選択 + 自由入力

著者、出版社、雑誌タイトルの候補がない場合は、まず基本マスターデータを作成する流れにする。これも承認フローの対象にする。ただし超管理者向けには、作成してすぐ承認するショートカットを用意する。

`story` は常に新しいものが入力される可能性が高いため、雑誌コンテンツ入力中に自動作成または候補作成できるようにする。
