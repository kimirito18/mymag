# mymag Database Design

このファイルは、総合書籍データベースシステムの設計メモです。

実装は、ユーザーが明示的に許可するまで開始しません。ここでは、対話で決まったテーブル設計、ID規則、入力フロー、承認フローを確認できるようにまとめます。

## 基本方針

- Supabase/PostgreSQL を想定する
- JSON を扱う項目は PostgreSQL の `jsonb` を想定する
- 表示用データと検索用データを分ける
- `reading` は人間が確認・修正する読み欄
- `search_text` / `search_reading` はシステムが自動生成する検索用カラム
- `memo` は通常検索対象外。検索オプションで「メモまで検索する」を有効にした場合のみ対象
- `tag` は JSON 配列の文字列タグ。通常検索用の `search_text` に含める
- 編集、追加、削除は承認制にする
- 超管理者は「保存して反映」で、内部的に申請から承認まで一括処理できる

## Application Layout

基本は、ページ遷移をできるだけ行わない1画面型の管理アプリにする。

全体構成:

```text
ヘッダー
メイン作業エリア
フッター
```

ヘッダー:

- 左側にメニューボタン
- 中央に丸型のグローバル検索窓
- 検索窓の右端に虫眼鏡アイコンを置く
- 右側にアカウントアイコン
- 右端にハンバーガーアイコン

左メニューは主要データ操作に使う。

- MI
- 雑誌タイトル
- 単行本
- 著者
- 出版社
- 承認待ち
- 検索

右メニューはアカウント・設定・補助機能に使う。

- アカウント
- 表示設定
- ユーザー管理
- システム設定
- ヘルプ
- ログアウト

フッターは小さく置く。

- システム名
- バージョン
- 保存状態
- 最終同期時刻

画面はスケーラブルにする。

- PC: 閲覧、追加、編集、承認をすべて扱う
- タブレット: 閲覧、追加、編集を扱う
- スマホ: 閲覧のみ

スマホでは編集画面を無理に作らない。編集機能へ入ろうとした場合は、PCまたはタブレットで操作する案内を出す。

## Authentication And Users

このシステムはクローズド運用とする。ユーザー登録・ログインなしでは閲覧もできない。

ログイン画面は別ページにせず、アプリ画面上のログインダイアログとして出す。

- 未ログイン状態ではログインダイアログを強制表示
- ログイン後は同じ画面へ戻る
- ログイン済みの場合、ヘッダーにアカウントアイコンを表示する

基本ログイン:

```text
アカウント名
パスワード
```

権限:

- `super_admin`: 超管理者
- `expert`: 専門家
- `viewer`: 閲覧者

権限ごとの扱い:

| 権限 | できること |
|---|---|
| `super_admin` | 全操作、承認、ユーザー管理 |
| `expert` | 追加・編集・削除申請、閲覧 |
| `viewer` | 閲覧のみ |

ユーザー管理画面は超管理者専用。

ユーザー管理画面で扱うこと:

- ユーザー一覧
- ユーザー追加
- ユーザー編集
- ユーザー無効化
- 権限変更
- 最終ログイン確認

想定テーブル:

```text
user_profiles

user_id
display_name
account_name
email
role
status
memo
created_at
updated_at
last_login_at
```

`status`:

- `active`
- `suspended`
- `invited`

超管理者は 1Password のパスキーを使う。

方針:

- 閲覧者・専門家はアカウント名 + パスワード
- 超管理者は重要操作時に 1Password パスキー確認を求める
- 通常のMI編集や保存では毎回パスキーを求めない

パスキー確認を求める操作:

- ユーザー追加
- ユーザー削除・無効化
- 権限変更
- 承認済みデータの削除
- 大量インポート
- システム設定変更
- パスキー管理

超管理者は複数のパスキー登録を推奨する。

## ID 規則

運用システム内では、以下の ID を正式 ID として扱う。

| 対象 | ID形式 | 例 |
|---|---|---|
| 著者 | `A` + 数字 | `A48012` |
| 出版社 | `P` + 数字 | `P4080000000` |
| 単行本 | `B` + 数字 | `B200125` |
| 雑誌タイトル | `M` + 数字 | `M119459` |
| 雑誌1冊 | `MI` + 数字 | `MI537976` |
| 単話 | `S` + 数字 | `S000001` |

既存データは数字部分を残し、接頭辞を新規則へ変換する。

```text
著者: C48012 -> A48012
出版社: P4080000000 -> P4080000000
単行本: M200125 -> B200125
雑誌タイトル: C119459 -> M119459
雑誌1冊: M537976 -> MI537976
```

`source_*_id` は持たない。

## 共通カラム

以下の管理対象テーブルには `tag` を持たせる。

- `authors`
- `publishers`
- `books`
- `magazine_titles`
- `magazine_issues`
- `stories`
- `content_types`

`tag` は JSON 配列の文字列タグ。

```json
["重要", "要確認", "成人向け"]
```

`tag` は `search_text` に含める。

## authors

著者・作者・ペンネームのマスター。

```text
authors

author_id
author_name
author_reading
other_author_ids
alias_note
social_links
memo
tag

search_text
search_reading
created_at
updated_at
```

必須:

- `author_name`
- `author_reading`

`author_reading` は自動予測補完するが、最終的に人間が確認する。

`other_author_ids` は、同一人物・別名義の著者 ID を JSON 配列で持つ。相互リンクを基本にする。

```json
["A12345", "A67890"]
```

運用ルール:

- 自分自身の ID は入れない
- 存在しない `author_id` は入れない
- 重複 ID は入れない
- story や book には、その時点で使われた名義の `author_id` を残す
- 検索時は `other_author_ids` を展開して別名義の作品も拾う

`social_links` は JSON 配列。

```json
[
  {
    "service": "X",
    "account": "@sample",
    "url": "https://x.com/sample",
    "memo": "2024年5月にアカウント凍結"
  }
]
```

`service` はプリセット候補あり、自由追加可。

候補:

- X
- Instagram
- Bluesky
- Threads
- Facebook
- YouTube
- ニコニコ
- Pixiv
- Pixiv FANBOX
- Fantia
- Patreon
- note
- BOOTH
- Skeb
- 公式サイト
- ブログ
- その他

特殊レコード:

- `著者不明`
- `author_reading`: `ちょしゃふめい`
- ID は通常採番を使う

## publishers

出版社マスター。

```text
publishers

publisher_id
publisher_name
publisher_reading
address
url
related_link
start_date
end_date
description
memo

predecessor_publisher_ids
successor_publisher_ids
related_publishers
publisher_relation_note

tag
search_text
search_reading
created_at
updated_at
```

必須:

- `publisher_name`
- `publisher_reading`

`publisher_reading` は自動予測補完するが、最終的に人間が確認する。

前身・後継:

```json
predecessor_publisher_ids: ["P12345"]
successor_publisher_ids: ["P67890"]
```

関連出版社:

```json
[
  {"publisher_id": "P4080000000", "relation": "親会社"},
  {"publisher_id": "P4060000000", "relation": "グループ会社"}
]
```

特殊レコード:

- `出版社不明`
- `publisher_reading`: `しゅっぱんしゃふめい`
- ID は通常採番を使う

## magazine_titles

雑誌タイトル単位のマスター。何月号という1冊ではなく、雑誌名そのものを管理する。

```text
magazine_titles

magazine_id
title
title_reading
publisher_ids
publisher_name
first_published_date
last_published_date
publication_frequency
issn
jpno
mtid
final_volume_number
final_issue_number
note

predecessor_magazine_ids
successor_magazine_ids
related_magazine_ids
relation_note

tag
search_text
search_reading
created_at
updated_at
```

最低必要入力:

- `title`
- `title_reading`
- `publisher_ids` または `publisher_name`

出版社不明の場合は、空欄にせず `出版社不明` レコードに紐づける。

`publication_frequency` は JSON 配列。

```json
["週刊"]
```

雑誌関係:

```json
predecessor_magazine_ids: ["M123456"]
successor_magazine_ids: ["M345678"]
related_magazine_ids: ["M456789", "M567890"]
```

## books

単行本1冊単位のテーブル。

```text
books

book_id
title
title_reading
subtitle
subtitle_reading

volume_number
volume_number_displayed

publisher_ids
publisher_name
author_ids
authors

label
series_title
series_title_reading

has_rating
rating

publication_date
release_date

isbn
price
size
number_of_pages
note

tag
search_text
search_reading
created_at
updated_at
```

必須候補:

- `title`
- `title_reading`
- `publisher_ids`
- `author_ids`

不明な場合は、`出版社不明` または `著者不明` に紐づける。

`volume_number` はソート用の float。

例:

```text
volume_number: 1.5
volume_number_displayed: 1.5巻
```

日付:

- `publication_date`: 出版社が定義する発行日
- `release_date`: 実際に発売開始された発売日

`label` はテーブル化しない。文字列で保存し、既存入力値から補完候補を出す。

## magazine_issues

雑誌1冊単位の運用テーブル。

```text
magazine_issues

magazine_issue_id

magazine_id
magazine_title
magazine_title_reading
media_format

official_release_year
official_release_month
official_release_day
official_release_is_combined
official_release_combined_month
official_release_combined_day

display_release_year
display_release_month
display_release_day
display_release_is_combined
display_release_combined_month
display_release_combined_day

publication_year
publication_month
publication_day

issue_label
issue_number
sub_issue_number
issue_number_displayed
issue_number_note

volume_number
volume_issue_number
total_issue_number
volume_issue_displayed
volume_issue_note

publisher_ids
publisher_name
publisher_person
editor_person

has_rating
rating

price
size
number_of_pages
contents
note

tag
status
search_text
search_reading
created_at
updated_at
```

必須:

- `magazine_id`
- `magazine_title`

推奨:

- `magazine_title_reading`

`magazine_id` を選択した時点で、`magazine_titles` から `title`, `title_reading`, `publisher_ids`, `publisher_name` をコピーする。`magazine_title` は編集可で、null 不可。

`media_format`:

- `print`
- `digital`
- `print_and_digital`
- `unknown`

日付は3系統を持つ。

- 正式な発売日: `official_release_*`
- 表示上の発売日: `display_release_*`
- 発行日: `publication_*`

正式発売日と表示発売日には、合併号用のフラグと月日を持つ。

号数・巻号まわり:

- `issue_number`: 主号数
- `sub_issue_number`: 合併号などの副号数
- `issue_number_displayed`: 誌面上の号数表記
- `issue_number_note`: 補助表記号数・補足
- `volume_number`: 巻
- `volume_issue_number`: 巻内号
- `total_issue_number`: 通巻号
- `volume_issue_displayed`: 正式巻号表記
- `volume_issue_note`: 補助表記巻号・補足

細かい日付・号数・巻号項目は、MI入力画面では詳細欄に隠す。

MI入力画面には、左側に折りたたみ可能な登録済みMI一覧ナビを置く。

- 雑誌タイトル選択後、その `magazine_id` に紐づく登録済みMIを取得
- 発売日の古い順に並べる
- 登録済みMIをクリックすると閲覧・編集画面へ移動
- 未登録号の推測や「全何冊中何冊」は初期実装では行わない

## magazine_issues.contents

`contents` は、雑誌内コンテンツ一覧を JSON 配列で持つ。

初期表示は軽くする。

```text
表紙
story入力行
裏表紙
```

表紙・裏表紙は必ず初期行として用意する。

基本構造:

```json
[
  {
    "position": 1,
    "content_type": "cover",
    "title": "表紙",
    "contributors": [],
    "story_id": null,
    "story_candidate": null,
    "page_start": null,
    "page_end": null,
    "color_info": "",
    "memo": ""
  }
]
```

`content_id` は初期設計では持たない。

1ページ内に複数コンテンツが混在する場合があるため、ページ番号と行を一対一に固定しない。

story 行のデフォルト項目:

```text
story_type
title
episode_number
page_count
contributors
```

story 行の詳細項目:

```text
series_title
series_title_reading
title_reading
episode_number_sort
subtitle
subtitle_reading
is_first_episode
is_final_episode
color_info
memo
page_start
page_end
```

`episode_number` の自動推測はしない。

`color_info` は自由記入。

`memo` は通常検索対象外。検索オプションで「メモまで検索する」を有効にした場合のみ対象。

## stories

単話データベース。雑誌掲載だけでなく、将来は単行本の中身にも使う。

```text
stories

story_id
story_type
series_title
series_title_reading
episode_number
episode_number_sort
title
title_reading
subtitle
subtitle_reading
contributors
page_count
is_first_episode
is_final_episode
first_published_date
first_magazine_issue_id
status
merged_into_story_id
color_info
memo
tag

search_text
search_reading
created_at
updated_at
```

`story_id` は自動付与。入力者は ID を気にしない。

`story_type`:

- `serial`: 連載
- `one_shot`: 読み切り
- `extra`: 番外編
- `side_story`: 外伝
- `unknown`: 不明

重複が後から見つかった場合は統合する。

- 残す story に参照を寄せる
- 古い story は `status=merged`
- `merged_into_story_id` に統合先を入れる

## content_types

コンテンツ種別マスター。

```text
content_types

content_type_id
label
description
sort_order
is_active
tag

search_text
search_reading
created_at
updated_at
```

初期候補:

- `story`: 漫画・単話
- `cover`: 表紙
- `back_cover`: 裏表紙
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

`magazine_issues.contents[].content_type` はこのテーブルから選択する。

## 著者・出版社の共通入力UI

著者、表紙イラスト担当、出版社などは、共通の関係者入力 UI を使う。

通常は1欄。

```text
[著者を入力] [+]
```

複数の場合はダイアログ。

```text
肩書        名前
原作        武論尊
作画        原哲夫
[+ 追加]
```

内部保存:

```json
[
  {"role": "原作", "name": "武論尊", "author_id": "A11111"},
  {"role": "作画", "name": "原哲夫", "author_id": "A22222"}
]
```

肩書はテーブル化しない。プリセット候補あり、自由入力可。

肩書候補:

- 著
- 漫画
- 作
- 画
- 作画
- 原作
- 脚本
- 構成
- ネーム
- 監修
- 協力
- キャラクター原案
- イラスト
- 表紙イラスト
- その他

候補がない著者・出版社・雑誌タイトルは、まずマスター作成へ進む。story は新規が多いため、MI入力中に story 候補として扱い、承認時に正式作成する。

## 検索設計

各主要テーブルに以下を持つ。

```text
search_text
search_reading
```

用途:

- `search_text`: 漢字、かな、英字、タグなどの表記検索
- `search_reading`: ひらがな読み検索

PostgreSQL では `pg_trgm` の GIN index を使う想定。

```sql
create extension if not exists pg_trgm;
```

`memo` は通常検索対象外。検索オプションで「メモまで検索する」をオンにした場合だけ対象にする。

## 承認フロー

正式データと申請データを分ける。

想定テーブル:

```text
change_requests
audit_logs
```

`change_requests`:

```text
target_table
target_id
action
before_data
after_data
status
created_by
approved_by
created_at
approved_at
note
```

`action`:

- `create`
- `update`
- `delete`

`status`:

- `draft`
- `submitted`
- `approved`
- `rejected`
- `cancelled`

MI入力中はリアルタイムでドラフト保存する。ただし正式な `magazine_issues` にはまだ反映しない。

`contents` の正式確定タイミングは、MI 1件まるごとの承認時。

承認時に行うこと:

- MI本体を正式テーブルに保存
- `contents` を確定
- story 行から既存 `stories` を検索
- 既存 story があれば紐づけ
- なければ `story_id` を自動発行して作成
- `contents[].story_id` を確定
- 必要なマスター追加も反映
- `change_requests.status` を `approved` にする
- `audit_logs` に履歴を残す

超管理者の `保存して反映` は、内部的に以下を一括実行する。

```text
change_request 作成 -> validation -> 承認 -> 正式反映 -> audit_logs 保存
```

## バリデーション

リアルタイムチェックと承認時チェックの二重構成にする。

リアルタイムチェック:

- 著者候補検索
- 出版社候補検索
- story 類似候補検索
- `reading` 自動補完
- 未解決候補の表示

承認時チェック:

- `magazine_id` が選ばれているか
- `magazine_title` が空でないか
- 発売年・月・日が妥当か
- 同じ `magazine_id + year/month + issue_number` の MI がないか
- 同じ `magazine_id + issue_label` の MI がないか
- `content_type` が `content_types` に存在するか
- `position` が重複していないか
- story 候補が既存 story と重複していないか
- 未解決の著者・出版社がないか
- ページ番号がある場合、逆転していないか
- ページ番号がある場合、総ページ数を超えていないか
