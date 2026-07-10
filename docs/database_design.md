# mymag Database Design

このファイルは、総合書籍データベースシステムの設計メモです。

実装は、ユーザーが明示的に許可するまで開始しません。ここでは、対話で決まったテーブル設計、ID規則、入力フロー、承認フローを確認できるようにまとめます。

## 基本方針

- Supabase/PostgreSQL を想定する
- JSON を扱う項目は PostgreSQL の `jsonb` を想定する
- 表示用データと検索用データを分ける
- `reading` は人間が確認・修正する読み欄
- 検索用カラムはシステムが自動生成する。著者・出版社は `search_text` に統合し、必要なテーブルだけ `search_reading` を分ける
- `memo` は通常検索対象外。検索オプションで「メモまで検索する」を有効にした場合のみ対象
- `tag` は JSON 配列の文字列タグ。通常検索用の `search_text` に含める
- 編集、追加、削除は承認制にする
- 超管理者は「保存して反映」で、内部的に申請から承認まで一括処理できる
- このシステムは DB に接続できなければ通常運用できない前提とする
- DB 未接続時は、通常の一覧、検索、編集 UI を部分的に表示せず、専用の接続障害画面へ切り替える
- DB 未接続時は、サンプルデータや固定データを実データの代わりに表示しない

### DB 未接続時の画面方針

このシステムは、雑誌、著者、出版社、雑誌個別、作品、承認データをすべて DB から読み書きする。したがって、DB に接続できない状態では「一部だけ使える」ように見せない。

- アプリ起動時に共通の DB ヘルスチェックを行う
- 判定状態は `loading`、`ready`、`unavailable` の3段階を基本にする
- `loading` 中は通常画面の代わりに読込中表示を出す
- `ready` のときだけ通常の一覧、検索、編集、承認 UI を表示する
- `unavailable` のときは通常 UI を描画せず、専用の接続障害画面だけを表示する

接続障害画面で表示する内容:

- 「DB に接続できないため現在は利用できない」という明確な案内
- 再接続を試すボタン
- 現在のエラー要約
- ローカル開発では Supabase / Colima / Docker の起動確認案内

接続障害画面では、以下を禁止する:

- サンプル一覧の表示
- 既知の固定データを使った疑似表示
- 保存できない編集フォームの表示
- 実データのように見える件数表示

この方針により、「見えているが実は DB とは無関係な仮データだった」という混乱を避ける。

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

スマホ幅では、現在開いている編集画面の種類にかかわらず、同じ対象カテゴリの閲覧専用 View 画面へ自動的に切り替える。

- 編集フォーム、編集ボタン、保存申請などの編集操作は表示しない
- ボディヘッダーは表示しない
- トップナビゲーションは表示しない
- ヘッダーはグローバル検索窓とアカウントボタンだけを表示する
- フッターは PC・タブレットと同じものを維持する
- 本文は基本情報、タグ、関連情報などをカード形式で表示する
- 画面内に「スマホでは閲覧のみ。編集はPCまたはタブレットで行う」旨を表示する

スマホ幅からタブレット以上へ戻した場合は、元のカテゴリの編集画面へ自動的に戻る。

### 単行本機能の一時停止

現在の開発優先順位は雑誌データベースを中心とする。単行本機能は仕様確定まで工事中として扱う。

- ナビゲーションの単行本項目には工事中アイコンと表示を付ける
- 単行本ページを開いた場合は工事中案内だけを表示する
- 単行本のサンプル一覧、閲覧、追加、編集などの機能はすべて利用不可にする
- スマホの閲覧専用 View でも単行本データは表示せず、工事中案内だけを表示する

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

専門家の編集範囲:

- `expert` は、自分が追加したデータだけ編集できる
- 判定は各データの `owner_user_id` で行う
- 新規作成時は `owner_user_id = created_by = ログインユーザー` とする
- `expert` は他ユーザー所有の `published` データを閲覧できるが、編集フォームは読み取り専用にする
- `expert` は他ユーザー所有の `draft` と `submitted` を通常の編集画面では見ない
- `super_admin` は全ユーザーのデータを閲覧・編集・承認できる
- `viewer` は `published` の閲覧のみできる

超管理者の編集範囲スイッチ:

- `super_admin` は、編集画面で `自分の追加分のみ` と `全ユーザー分` を切り替えられる
- `自分の追加分のみ` では、`owner_user_id` が自分のデータだけを編集対象として表示する
- `全ユーザー分` では、すべてのデータを編集対象として表示する
- 初期表示は事故防止のため `自分の追加分のみ` を基本にする
- 承認画面ではこのスイッチに関係なく、申請中データを確認できる
- このスイッチは権限そのものではなく、超管理者向けの表示・編集範囲フィルタとして扱う
- 選択状態は `user_profiles.input_preferences` に保存できる。ただし、ログイン直後は安全側として `自分の追加分のみ` に戻す運用も許可する

アカウントボタン内の作業状態リスト:

一般ユーザー、つまり `expert` は、ヘッダーの自分のアカウントボタンから、自分が作成・編集中のデータ状態を確認できる。

アカウントメニュー:

- アカウントボタンを押すと、まずアカウント用のドロップダウンメニューを開く
- メニュー項目は、`アカウント情報`、`データの状態`、区切り線、`ログアウト` を基本にする
- `データの状態` は下層メニューを持つ
- `データの状態` の下層に、`編集中のデータ` と `申請中のデータ` を置く
- メニュー上では `データの状態 > 編集中のデータ`、`データの状態 > 申請中のデータ` の階層として扱う
- `編集中のデータ` を選ぶと、自分の編集中リストを開く
- `申請中のデータ` を選ぶと、自分の申請中リストを開く
- 将来的に画面幅や件数が増えた場合は、`データの状態` 画面内で `編集中` と `申請中` のタブ切り替えにしてもよい

メニュー構成例:

```text
アカウント情報
データの状態 >
  編集中のデータ
  申請中のデータ
----------------
ログアウト
```

作業状態リスト:

- `編集中` タブには、`owner_user_id = 自分` かつ `record_status = draft` のデータを表示する
- `申請中` タブには、`owner_user_id = 自分` かつ `record_status = submitted` のデータを表示する
- リスト項目には、対象種別、表示名、親データ名、最終更新日時を表示する
- 対象種別は、雑誌マスター、雑誌個別、著者、出版社、単行本、作品などを区別できるようにする

`編集中` タブ:

- `編集中` のデータは通常の編集画面で編集できる
- 画面ヘッダーには `保存申請` ボタンを置かず、申請操作はこの `編集中` リストに集約する
- リストの一番下に `申請` ボタンを置く
- 誤申請を避けるため、申請対象はチェックボックスなどで選択できるようにする
- `申請` ボタンを押すと、選択したデータのバリデーションを行う
- バリデーションに通ったデータは `record_status = submitted` へ変更する
- 同時に `submitted_by`, `submitted_at` を記録し、`audit_logs` に `submit` を残す

`申請中` タブ:

- `申請中` のデータは、基本的に編集できない
- リストから開いた場合も読み取り専用表示にする
- `申請中` のデータは、超管理者が承認するまでは通常閲覧には表示しない
- 申請者本人は、承認前であれば `申請中` から `編集中` に戻せる
- `編集中に戻す` を実行すると、`record_status = draft` に戻し、`audit_logs` に `withdraw_submission` を残す
- `編集中` に戻した後は、通常の編集画面で再編集できる

超管理者の承認画面は、このアカウントボタン内リストとは別に用意する。一般ユーザーは自分の作業状態を確認し、申請と申請取り下げを行う。超管理者は承認画面で全ユーザーの `submitted` を確認する。

このルールを基本にするため、初期実装では同時編集ロックを複雑にしない。ユーザー数は2〜3人程度を想定し、編集できる対象そのものを絞ることで衝突を減らす。

他ユーザー所有データの修正が必要な場合:

- `expert` は修正依頼やコメントとして申請する
- `super_admin` が確認して直接修正、または所有者へ差し戻す
- 必要な場合だけ、`super_admin` が `owner_user_id` を変更して担当者を移す

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
input_preferences
created_at
updated_at
last_login_at
```

`input_preferences` はユーザーごとの入力UI設定を `jsonb` で持つ。

例:

```json
{
  "reading_prediction": {
    "default_enabled": true,
    "disabled_columns": [
      "stories.title_reading",
      "magazine_issues.magazine_title_reading"
    ]
  }
}
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

主要な管理対象テーブルには、データ状態と編集者情報を持たせる。ドラフト専用テーブルは原則として分けず、同じテーブル内の状態フラグで管理する。

対象:

- `authors`
- `publishers`
- `books`
- `magazine_titles`
- `magazine_issues`
- `stories`
- `content_types`

共通管理カラム:

```text
record_status
owner_user_id
created_by
updated_by
submitted_by
approved_by
deleted_by
created_at
updated_at
submitted_at
approved_at
deleted_at
delete_reason
```

`record_status`:

- `draft`: 下書き
- `submitted`: 申請中
- `published`: 公開
- `deleted`: 削除済み

画面上の呼び方:

- `draft`: 編集中
- `submitted`: 申請中
- `published`: 公開
- `deleted`: 削除済み

表示ルール:

- 通常閲覧では `published` のみ表示する
- 編集画面では `published` に加えて、ログインユーザー本人の `draft` と `submitted` も表示する
- 承認画面では `submitted` を対象にする
- `deleted` は通常閲覧・通常編集には表示しない
- 超管理者は必要に応じて全状態を確認できる

編集権限:

- `owner_user_id` は、そのデータを編集できる担当ユーザーを表す
- `owner_user_id` は新規作成時に `created_by` と同じ値で自動設定する
- `expert` は `owner_user_id` が自分のデータだけ編集できる
- `super_admin` は `owner_user_id` に関係なく編集できる
- `super_admin` は画面上の編集範囲スイッチで、自分の所有データだけを編集対象に絞ることもできる
- `owner_user_id` の変更は `super_admin` のみ可能にする
- `owner_user_id` を持たない初期移行データは、超管理者所有、または読み取り専用として扱い、運用前に必要分だけ担当者を割り当てる
- `submitted` のデータは、申請者本人であっても通常編集はできない
- `submitted` を再編集したい場合は、承認前に `draft` へ戻してから編集する

保存方針:

- 入力内容はリアルタイムで対象テーブルへ保存する
- 基本の保存タイミングは、記入欄が `blur` になった瞬間、つまり入力欄からフォーカスが外れた時とする
- `blur` 時には、必要に応じて正規化とバリデーションを行ってから保存する
- タグ入力、複数行テーブル、候補選択リストなどは、Enter確定、候補選択、行追加・削除、タグ削除などの操作確定時も保存契機にする
- 入力中の1文字ごとには保存しない
- 保存リクエスト中は、同じ編集画面内の他入力を一時的に受け付けない
- 通常は一瞬で完了する想定だが、ネットワーク遅延などで保存が長引く場合は保存中インジケータを表示する
- 保存中インジケータは、フッターの保存状態表示、対象フィールド付近、または画面右上の小さなステータス表示で示す
- 保存失敗時は対象フィールドを未保存状態として残し、エラー表示と再試行操作を出す
- ページを離れる、別カテゴリの編集画面へ移る、サイドバーで別の雑誌個別を選ぶ、履歴から別対象を選ぶ、ブラウザを閉じるなど、現在の編集対象から離れる操作では未保存チェックを行う
- 未保存または保存失敗中の変更がある場合は、離脱前に確認ダイアログを表示する
- 確認文言例: `まだ保存されていない編集があります。このまま移動しますか？`
- 確認ダイアログでは、`保存して移動`, `保存せず移動`, `キャンセル` の選択肢を用意する
- 保存中の場合は、保存完了まで移動操作を待たせる。保存に失敗した場合は、エラーを表示して移動をキャンセルする
- ブラウザのタブを閉じる、再読み込みする、外部ページへ移動する場合は `beforeunload` で標準確認を出す
- リアルタイム保存は正式公開ではなく、`record_status` によって下書き・申請中・公開を区別する
- 新規作成時は `draft` として保存する
- 保存申請時は `submitted` に変更する
- 申請取り下げ時は `submitted` から `draft` に戻す
- 承認時は `published` に変更する
- 削除承認時は原則として物理削除せず、`record_status = deleted`、`deleted_by`、`deleted_at`、`delete_reason` を記録する

雑誌個別ページの保存単位:

雑誌個別ページは1画面だが、DB上は以下を分けて扱う。

- `magazine_issues`: 雑誌1冊そのものの基本情報
- 掲載内容系DB: 作品リスト・コンテンツの行データ

そのため、リアルタイム保存、保存中ロック、エラー表示はページ全体一律ではなく、原則として保存対象単位で分ける。

例:

- 雑誌個別情報欄の blur 保存中は、雑誌個別情報欄を一時ロックする
- 作品リスト行の保存中は、その行または作品リスト領域を一時ロックする
- コンテンツ行の保存中は、その行またはコンテンツ領域を一時ロックする
- MI本体の保存失敗と、作品リスト・コンテンツの保存失敗は別々に表示する

ただし、保存申請時は雑誌個別ページ全体を1つの申請対象として扱い、MI本体・作品リスト・コンテンツをまとめて確認する。

新規作成の初期フロー:

新規作成時は、必須項目が空のままリアルタイム保存を開始しない。まず必須項目だけを入力する初期作成ステップを挟む。

基本フロー:

```text
新規ボタン
↓
必須項目だけ入力
↓
作成
↓
record_status = draft のレコードを1件作成
↓
通常編集画面へ移動
↓
以降は blur / 操作確定ごとのリアルタイム保存
```

この初期作成ステップ中は、まだDBレコードを作らない。入力欄は画面上の一時状態として保持する。

初期作成ステップ中のUI:

- 必須項目だけを表示する
- 他の項目は非表示、または非アクティブにする
- 作品リスト・コンテンツなど、親レコードが必要な領域は表示しない
- 保存申請ボタンは非表示、または無効にする
- 必須項目が埋まった時だけ「作成して編集を始める」を押せる

対象別の初期必須項目:

- 雑誌マスター: タイトル、読み
- 雑誌個別: タイトル、読み
- 著者: 著者名、読み
- 出版社: 出版社名、読み

この方式により、タイトルや読みが空の仮レコードをDBに作らず、作成済みレコードはすべて最低限の識別情報を持った状態にする。

編集者情報:

- `owner_user_id`: 現在の編集担当者。専門家の編集権限判定に使う
- `created_by`: 最初に作成したユーザー
- `updated_by`: 最後に編集したユーザー
- `submitted_by`: 保存申請したユーザー
- `approved_by`: 承認したユーザー
- `deleted_by`: 削除を承認、または実行したユーザー
- `deleted_at`: 削除済みにした日時
- `delete_reason`: 削除理由

これらは一覧表示、履歴表示、承認確認、監査ログ作成のために使う。

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

`search_text` はユーザーが直接編集しない。各テーブルの作成・更新時にシステムが再生成する。

生成タイミング:

- 新規作成時: 必須項目を満たしてレコードを作る時
- blur保存時: 検索対象項目が変更された時
- タグ変更時: タグ追加・削除を確定した時
- 関連リンク変更時: 別名義、関連出版社、関連誌など検索へ含める関連データが変わった時
- CSVインポート時: 正規化後、DBへ投入する直前
- 一括再生成時: かな補完、ローマ字化、検索正規化ルールを変更した時

`search_text` に含める値:

- 表示名
- 読み
- ID
- タグ
- 別名義や関連データの表示名
- 別名義や関連データの読み
- 読みをローマ字化した検索語

`search_text` に含めない値:

- 長いメモ本文
- URL
- SNSアカウントの補足説明
- 監査ログ、承認コメント

文字数目安:

- 通常目標: 500文字以内
- 最大文字数: 1000文字
- 1000文字を超える場合は、検索語を重複削除し、優先度の低い語から切り落とす

`search_text` は `text` 型で持つが、生成処理側で上限を守る。DB制約で厳しく弾くと保存失敗につながるため、初期実装では自動整形とログ記録で対応する。

ローマ字化:

- 著者名、出版社名、雑誌名など読みを持つデータは、読みからローマ字検索語を自動生成する
- 初期はヘボン式寄りの代表表記を作る
- 代表表記に加えて、検索用の揺れ表記も作る
- 長音は厳密に記号化せず、検索しやすさを優先する
- ローマ字は編集UIには出さず、`search_text` の中だけに持つ
- 表記候補が増えすぎる場合は、1レコードあたりのローマ字候補数に上限を設ける
- 変換ルールを変更した場合は、全データの `search_text` を一括再生成する

主な揺れ:

- し: `shi` / `si`
- ち: `chi` / `ti`
- つ: `tsu` / `tu`
- ふ: `fu` / `hu`
- じ: `ji` / `zi`
- しゃ: `sha` / `sya`
- しゅ: `shu` / `syu`
- しょ: `sho` / `syo`
- ちゃ: `cha` / `tya`
- ちゅ: `chu` / `tyu`
- ちょ: `cho` / `tyo`
- じゃ: `ja` / `zya`
- じゅ: `ju` / `zyu`
- じょ: `jo` / `zyo`

例:

```text
author_name: 鳥山明
author_reading: とりやまあきら
search_text: A000001 鳥山明 とりやまあきら toriyamaakira

author_name: 清水
author_reading: しみず
search_text: A000002 清水 しみず shimizu simizu
```

生成場所:

- 通常保存ではAPI側で生成してDBへ保存する
- DB直更新や一括インポートでは、再生成スクリプトを必ず通す
- DBトリガーだけに依存しない。別テーブルの関連データ、たとえば著者の別名義リンクまで含める必要があるため

タグ入力UIはチップ型に統一する。

基本形:

```text
[× 少年] [× バトル] [× 時代劇] [タグを入力...]
```

入力ルール:

- 単語を入力して Enter でタグ確定
- チップ左側の `×` でタグ削除
- 入力欄が空の状態で Backspace を押すと、最後のタグを削除
- 同じタグは重複登録しない
- 前後の空白は削除する
- 空文字は登録しない
- カンマ区切り貼り付け時は、複数タグとして分割できるようにする

内部保存:

```json
["少年", "バトル", "時代劇"]
```

タグの表示順は入力順を維持する。

## 削除方針

削除は、通常の編集より慎重に扱う。特に `magazine_titles`、`authors`、`publishers` は他テーブルやJSON項目から強く参照されるため、削除前に必ず依存関係を確認する。

基本方針:

- 初期実装では、主要データを物理削除しない
- 削除承認後は `record_status = deleted` とし、通常閲覧・通常編集から隠す
- `deleted_by`、`deleted_at`、`delete_reason` を必ず残す
- `audit_logs` には `delete_request`、`delete_approve`、`delete_reject`、`restore` を残す
- `published` の削除は承認制にする
- 超管理者が承認済みデータを削除する場合は、1Password パスキー確認を求める
- 専門家は自分が所有するデータだけ削除申請できる
- `draft` で、まだ他データから参照されていない自分のデータは「破棄」に近い扱いで削除できる。ただし監査ログは残す

削除前確認:

削除ボタンを押した時点で、すぐ削除せず、先に依存関係チェックを行う。

確認画面には以下を表示する。

- 削除対象のID、名称、読み、状態、所有者
- 強い関係の件数
- 弱い関係の件数
- 強い関係のあるデータ一覧
- 関係の種類
- 関係先を開く操作
- 削除できるか、統合や付け替えが必要かの判定

強い関係:

削除すると正式データの意味が壊れる関係。強い関係が残っている場合は、原則として削除を許可しない。

例:

- `magazine_titles` を参照する `magazine_issues.magazine_id`
- `magazine_titles` を参照する `related_magazines[].magazine_id`
- `authors` を参照する作品リスト・コンテンツの著者、関係者、寄稿者
- `authors` を参照する `author_alias_links`
- `publishers` を参照する雑誌マスターの出版社情報
- `publishers` を参照する雑誌個別情報の出版社情報
- `publishers` を参照する単行本の出版社情報
- `publishers` を参照する `related_publishers[].publisher_id`
- `stories` を参照する雑誌個別の作品リスト

弱い関係:

削除しても正式データの意味までは壊れない、または履歴として残すべき関係。弱い関係だけなら削除申請は可能にする。

例:

- `work_histories`
- `audit_logs`
- 検索用キャッシュ
- 過去の申請履歴
- 自由記入テキスト内の名前一致

対象別の削除扱い:

- 雑誌個別: 親の `magazine_title` に紐づく1冊単位なので、他マスターより削除しやすい。ただし作品リスト、コンテンツ、`stories.first_magazine_issue_id` などの参照は確認画面に出す
- 雑誌マスター: 紐づく雑誌個別、関連誌、出版社、検索・履歴への影響が大きいため、強い関係が残る限り削除しない。特に `magazine_issues` が1件でも残っている場合は、雑誌マスター単体では削除できない
- 著者: 雑誌マスター、雑誌個別、単行本、作品、別名義、関係者入力から参照されるため、参照が残る限り削除できない。完全に孤立している著者データだけ削除申請できる
- 出版社: 雑誌マスター、雑誌個別、単行本、関連会社から参照されるため、参照が残る限り削除できない。完全に孤立している出版社データだけ削除申請できる
- 単行本: 著者、出版社、レーベル、シリーズとの関係を確認してから削除する
- story: 掲載履歴から参照される場合は削除せず、統合または `merged` にする

削除できない場合の代替操作:

- 統合: 重複データを別の正式データへ統合する
- 付け替え: 参照先を別のIDへ変更する
- 非表示: `record_status = deleted` ではなく、運用上の非表示フラグで通常検索から外す
- 終了日設定: 出版社や雑誌マスターでは、削除ではなく `closed_date`、`end_date` を設定する
- メモ追記: 誤登録や重複疑いを `memo` や `tag` で残し、後で整理する

雑誌マスター削除の特別ルール:

雑誌マスターと雑誌個別は親子関係が強いため、雑誌マスターだけを削除して雑誌個別が残る状態は作らない。

許可する削除パターン:

- 先に紐づく雑誌個別をすべて削除済みにし、その後で雑誌マスターを削除する
- 超管理者が、雑誌マスターと紐づく雑誌個別をまとめて削除する

許可しない削除パターン:

- `magazine_issues` が残っている状態で、雑誌マスターだけを削除する
- 雑誌マスター削除後に、親のない雑誌個別が残る

一括削除の場合:

- 対象の雑誌マスターを表示する
- 紐づく雑誌個別の件数と代表リストを表示する
- 作品リスト、コンテンツ、story参照など、雑誌個別側の強い関係も表示する
- 一括削除対象を明示する
- 超管理者のパスキー確認を求める
- `magazine_title` と紐づく `magazine_issues` をすべて `record_status = deleted` にする
- `audit_logs` には、雑誌マスター削除と各雑誌個別削除の両方を記録する

一括削除確認UI例:

```text
雑誌マスター一括削除確認

対象: テスト雑誌 M999999
紐づく雑誌個別: 12件

この操作では、雑誌マスターと紐づく雑誌個別12件をまとめて削除済みにします。
この操作は通常閲覧から消えますが、監査ログと削除済みデータは保持されます。

[一括削除申請] [キャンセル]
```

著者・出版社削除の特別ルール:

著者と出版社も、他データから参照されている限り削除できない。削除できるのは、強い関係が0件で、完全に孤立しているデータだけとする。

著者で削除を禁止する参照:

- 雑誌個別の作品リストに著者として入っている
- 雑誌個別のコンテンツ関係者に入っている
- `stories.contributors` から参照されている
- 単行本の著者として入っている
- 著者マスターの `author_alias_links` から参照されている
- 雑誌マスターや雑誌個別のメモ以外の構造化項目から著者IDで参照されている

出版社で削除を禁止する参照:

- 雑誌マスターの出版社情報に入っている
- 雑誌個別の出版社情報に入っている
- 単行本の出版社情報に入っている
- 出版社マスターの `related_publishers` から参照されている
- 雑誌マスター、雑誌個別、単行本の構造化項目から出版社IDで参照されている

削除できる条件:

- 強い関係が0件
- `entity_references` 上でも参照が0件
- 念のため正式テーブルとJSON項目の再確認でも参照が見つからない
- 削除理由が入力されている
- 削除対象が `published` の場合は承認フローを通す

削除できない場合:

- 著者は削除ではなく、統合、別名義登録、メモ追記を検討する
- 出版社は削除ではなく、統合、社名変更、関連会社設定、終了日設定を検討する

確認UI例:

```text
著者削除前確認

対象: 山田太郎 A000123

強い関係:
- 雑誌個別 18件
- story 12件
- 別名義参照 1件

この著者は他データから参照されているため削除できません。
統合または別名義整理を検討してください。
```

孤立している場合:

```text
出版社削除前確認

対象: テスト出版 P999999

強い関係: 0件
弱い関係: 作業履歴 1件、監査ログ 2件

この出版社は構造化データから参照されていません。

[削除申請] [キャンセル]
```

削除確認UI:

```text
削除前確認

対象: 集英社 P4080000000
状態: 公開

強い関係:
- 雑誌マスター 42件
- 雑誌個別 1,284件
- 単行本 9,820件
- 関連会社 3件

このデータは強い関係が残っているため削除できません。
先に統合、付け替え、終了日設定を検討してください。
```

強い関係がない場合:

```text
削除前確認

対象: テスト出版社 P999999
状態: 公開

強い関係: 0件
弱い関係: 作業履歴 2件、監査ログ 4件

[削除申請] [キャンセル]
```

削除申請の流れ:

```text
削除ボタン
↓
依存関係チェック
↓
削除前確認
↓
削除申請
↓
record_status は published のまま維持
↓
change_requests.action = delete, status = submitted
↓
超管理者が承認
↓
record_status = deleted
↓
audit_logs に delete_approve を記録
```

強い関係の管理:

JSON内にIDを保存する項目があるため、PostgreSQLの外部キーだけではすべての関係を守れない。削除前確認を高速かつ確実に行うため、将来的に参照集計用の補助テーブルを持つ。

想定テーブル:

```text
entity_references
```

想定カラム:

```text
reference_id
source_table
source_id
source_label
source_field
target_table
target_id
relation_kind
relation_label
created_at
updated_at
```

`relation_kind`:

- `strong`
- `weak`

例:

```text
source_table: magazine_issues
source_id: MI537976
source_field: magazine_id
target_table: magazine_titles
target_id: M119459
relation_kind: strong
relation_label: 親雑誌
```

`entity_references` は、保存時または承認反映時に更新する。削除確認画面ではこのテーブルを参照し、必要に応じて正式テーブル・JSON項目を再確認する。

想定インデックス:

```sql
create index entity_references_target_idx
on entity_references (target_table, target_id, relation_kind);

create index entity_references_source_idx
on entity_references (source_table, source_id);
```

## バックアップ方針

Supabase は無料プランの範囲で運用する前提とする。そのため、Supabase 側の有料自動バックアップや PITR を前提にせず、アプリ側・運用側で定期バックアップを用意する。

基本方針:

- 無料プランでは、定期的なスクリプトバックアップを主バックアップとする
- バックアップは個数限定の世代管理にし、古いものから上書き・削除する
- 超管理者は管理画面から手動バックアップを作成し、ダウンロードできる
- バックアップは公開リポジトリに置かない
- DB接続情報、APIキー、サービスロールキーはバックアップファイルに含めない
- 重要データなので、少なくとも1つはアプリサーバー外の場所に保存する

バックアップ対象:

- ロール情報: `roles.sql`
- スキーマ: `schema.sql`
- データ: `data.sql`
- マイグレーション履歴: 必要になった場合は `supabase_migrations` を別途保存する
- Supabase Storage を使う場合、Storage の実ファイルはDBバックアップに含まれないため別バックアップを用意する

初期段階では、DB本体の論理バックアップを優先する。

定期バックアップ:

- `supabase db dump` または `pg_dump` を使う
- 1日1回を基本にする
- 世代数は設定値で管理する
- 初期値は `scheduled` 7世代を想定する
- ファイル名には日時を入れる
- 世代数を超えたら古いバックアップから削除する
- バックアップ成功・失敗を `audit_logs` または専用ログに記録する

ファイル名例:

```text
backup_2026-06-06_0300_roles.sql
backup_2026-06-06_0300_schema.sql
backup_2026-06-06_0300_data.sql
```

世代管理例:

```text
scheduled/
  2026-06-01_0300/
  2026-06-02_0300/
  ...
  2026-06-07_0300/
```

8世代目を作る時は、最も古い `2026-06-01_0300` を削除する。

保存先:

- ローカル開発中は、超管理者のローカル環境または外付けディスクに保存する
- 本番運用では、非公開の保存先に置く
- GitHubに置く場合は private repository かつ暗号化済みファイルに限定する
- public repository には絶対にDBバックアップを置かない

超管理者の手動バックアップ:

管理画面に `手動バックアップ` 機能を用意する。

操作:

```text
管理
↓
システム設定
↓
バックアップ
↓
手動バックアップ作成
↓
パスキー確認
↓
バックアップ作成
↓
ダウンロード
```

手動バックアップのルール:

- 超管理者だけが実行できる
- 実行前に 1Password パスキー確認を求める
- バックアップ作成中は進行中表示を出す
- 完了後に `.zip` でダウンロードできる
- 手動バックアップも世代数を制限する
- 初期値は `manual` 5世代を想定する
- 手動バックアップの作成者、作成日時、ファイルサイズ、結果を記録する

手動バックアップファイル例:

```text
mymag_manual_backup_2026-06-06_1530.zip
```

zip内部:

```text
roles.sql
schema.sql
data.sql
backup_manifest.json
```

`backup_manifest.json`:

```json
{
  "app": "mymag",
  "backup_type": "manual",
  "created_at": "2026-06-06T15:30:00+09:00",
  "created_by": "user_id",
  "schema_version": "0.1",
  "files": ["roles.sql", "schema.sql", "data.sql"]
}
```

想定設定:

```text
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_CRON=0 3 * * *
BACKUP_RETENTION_SCHEDULED=7
BACKUP_RETENTION_MANUAL=5
BACKUP_OUTPUT_DIR=/path/to/private/backups
```

バックアップログ:

専用テーブルを持つ場合:

```text
backup_logs
```

想定カラム:

```text
backup_log_id
backup_type
status
file_name
file_size
storage_path
created_by
started_at
finished_at
error_message
metadata
```

`backup_type`:

- `scheduled`
- `manual`

`status`:

- `running`
- `success`
- `failed`
- `deleted_by_rotation`

復元方針:

- 復元は超管理者だけが行う
- 初期実装ではアプリ画面からの復元は行わない
- 復元はローカル検証環境でバックアップを読み込んで確認してから、本番に反映する
- 本番DBを直接復元する場合は、事前に現在DBの手動バックアップを必ず作る
- 復元手順は `docs/restore_runbook.md` のような別ファイルにまとめる

バックアップの位置づけ:

- 日常的な誤編集・誤削除は `record_status`、`audit_logs`、削除済みデータ保持で戻す
- バックアップは、DB破損、重大な誤操作、プロジェクト消失、移行失敗に備える最後の保険とする

## テストDB方針

本番投入前のテストでは、本番Supabase DBを直接使わない。仮DBは、本番と同じスキーマを持つが、本番とは別の環境として作る。

無料プラン前提の優先順位:

1. ローカル Supabase DB
2. 必要な時だけ使う別Supabaseプロジェクト
3. 有料前提の Supabase Branching は初期運用では使わない

基本方針:

- テストDBは本番DBと接続情報を分ける
- `.env.local`、`.env.test`、`.env.production` で接続先を切り替える
- 本番DBの直接コピーではなく、マイグレーション + seed/import で作る
- テストデータは何度でも捨てて作り直せるものとする
- テストDBで作った編集・申請・承認データは、本番へ自動反映しない
- 本番へ入れる時は、別途インポート手順と承認フローを通す

ローカルSupabase:

Supabase CLI のローカル開発スタックを使う。ローカル環境には Postgres、Auth、Storage などが含まれる。

ローカル実行環境の保存場所:

- Colima/Docker の実体は、システムHDDを圧迫しないよう外付け側に置く
- 現在の配置は `/Volumes/DATA4 8T/myprogram/local_runtime/colima`
- `/Users/miyakun/.colima` は上記フォルダへのシンボリックリンクにする
- 外付けボリュームが接続されていない場合、ローカルSupabaseは起動できない
- プロジェクト内には、DB実体ではなく、再現用のマイグレーション、seed、インポートスクリプトだけを置く

初期配置と容量の目安:

```text
プロジェクト本体:
  /Volumes/DATA4 8T/myprogram/Codex/mymag
  約3.3GB

npm依存:
  /Volumes/DATA4 8T/myprogram/Codex/mymag/node_modules
  約566MB

Supabase設定:
  /Volumes/DATA4 8T/myprogram/Codex/mymag/supabase
  約40KB

Next.jsビルド出力:
  .next-build 約304MB
  .next-dev 約164MB

Colima/Docker実体:
  /Volumes/DATA4 8T/myprogram/local_runtime/colima
  約9.7GB

Dockerイメージ:
  約8.5GB
  未使用整理可能分 約1.4GB

Docker DB volume:
  supabase_db_mymag 約96MB
  supabase_storage_mymag 0B
```

初期投入データ:

```text
authors: 11005件
author_alias_links: 707件
```

Colima VM の割り当て:

```text
CPU: 4
Memory: 6GiB
Disk: 40GiB
```

容量は Docker イメージ更新、DB投入量、ビルドキャッシュにより変動する。

ローカル実行環境の停止・削除:

```text
scripts/uninstall_local_runtime.sh --stop-only
scripts/uninstall_local_runtime.sh --docker-data
scripts/uninstall_local_runtime.sh --all
```

`--stop-only` は Supabase と Colima を停止するだけで、データは削除しない。

`--docker-data` は、このプロジェクトの Supabase コンテナ、Docker volume、未使用Dockerイメージを削除する。DBデータも消える。

`--all` は `--docker-data` に加えて、`/Users/miyakun/.colima` のシンボリックリンクと `/Volumes/DATA4 8T/myprogram/local_runtime/colima` の実体を削除する。

削除を伴うモードでは、誤実行防止のため確認文の入力を必須にする。

想定コマンド:

```text
npx supabase init
npx supabase start
npx supabase migration new create_initial_schema
npx supabase db reset
```

ローカルDBの作り方:

```text
supabase/migrations/
  001_create_core_tables.sql
  002_create_audit_tables.sql
  003_create_reference_tables.sql

supabase/seed.sql
```

テストデータ投入:

- 初期は `master_data` や `dataset/results/*.csv` からインポートする
- CSVそのものを直接本番テーブルへ流し込まず、正規化スクリプトを通す
- ID、読み、JSON項目、参照関係を整形してから投入する
- 著者、出版社、雑誌マスター、雑誌個別の順に入れる
- 最後に `entity_references` を再生成する

ローカルDBは何度でも作り直せる。

```text
supabase db reset
↓
migrations 適用
↓
seed.sql 適用
↓
CSV import script 実行
↓
テスト開始
```

別Supabaseプロジェクトを使う場合:

- 無料プランの範囲で余裕がある場合だけ使う
- 用途は、ローカルではなくWeb公開状態で動作確認したい時に限定する
- プロジェクト名は `mymag-test` のように本番と明確に分ける
- API URL、anon key、service role key は本番と絶対に混ぜない
- テストプロジェクトは不要になったら削除する前に、必要なログや検証結果を保存する

環境変数例:

```text
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-anon-key

# .env.test
NEXT_PUBLIC_SUPABASE_URL=https://test-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key

# .env.production
NEXT_PUBLIC_SUPABASE_URL=https://production-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=production-anon-key
```

テストDBのデータ量:

- UI表示テストでは、各マスター数百〜数千件でもよい
- 検索・一覧性能テストでは、著者約11,000件のような実データを入れる
- 雑誌個別と作品リストは、最初は代表的な雑誌だけで試す
- 全量投入は、スキーマとインポート手順が安定してから行う

テストで確認すること:

- 新規作成の初期必須項目フロー
- blur保存
- 保存中ロック
- 編集中/申請中/公開/削除済みの状態遷移
- 所有者による編集制限
- 超管理者の編集範囲スイッチ
- 削除前の強い関係チェック
- 手動バックアップ作成
- CSVインポート後の検索速度

テストDBの禁止事項:

- 本番用service role keyをテスト環境で使わない
- テストDBの接続情報をGitにコミットしない
- 本番DBから個人情報や秘匿データを無加工でコピーしない
- テストDBでの削除・承認結果を本番に自動同期しない

## 自由記入 + 候補選択入力UI

自由記入もでき、かつ候補から選択できる入力欄は、今後すべて共通UIにする。

基本形:

```text
[自由記入欄        ▼]
```

入力欄には直接文字を入力できる。右端には常に小さな候補ボタンを表示し、押すと候補一覧を開く。

UIルール:

- ブラウザ標準の `datalist` 表示には依存せず、独自の候補メニューを使う
- 入力済みの文字で候補を1件だけに絞り込まず、候補ボタンから開いた一覧では登録候補を一覧表示する
- 候補外の値も入力できる
- 候補ボタンは、作品リストの「タイプ」と同じ黒い小ボタン形式にする
- 候補ボタンのサイズは入力欄のサイズに合わせて調整する

標準ラベル形式:

- 作品リスト詳細の「タグ」と同じバッジサイズを標準ラベルの基準にする
- CSS上は `.field-badge` のサイズを共通ルールとして使う
- 標準ラベルは入力欄の上に置き、入力欄自体は通常の入力サイズルールに従う

チェックボックスUIルール:

- bool型の入力は、左にテーマカラー緑のラベルピル、右に独立したチェックボックスを置く
- ラベルとチェックボックス全体には横型入力欄のような外枠線を付けない
- ラベルの角丸、文字サイズ、文字の太さは横ラベル形式に合わせる
- チェックボックスは白地に枠線を持ち、枠線とチェックマークはラベル背景と同じテーマカラー緑にする
- チェックボックス本体は横ラベル高さの約2/3を基準にし、上下中央に揃える
- CSS上は `.checkbox-rule-field`、`.checkbox-rule-label`、`.checkbox-rule-box` を共通ルールとして使う

候補の管理:

- 候補リストは超管理者だけが編集できる
- 専門家は候補外の自由入力はできるが、共通候補リスト自体は変更できない
- 候補追加が必要な場合は、承認対象の候補追加申請として扱う

対象例:

- 作品リストの `story_type`
- 一般コンテンツの `content_type`
- 雑誌個別情報の `publication_frequency`, `media_format`, `binding`, `size`, `rating`
- 関係者入力の肩書
- 将来的な分類、状態、色種別などの候補入力

## テーブルダイアログ

複数行の小さなJSON配列を入力するUIを、今後「テーブルダイアログ」と呼ぶ。

基本形:

```text
[要約入力欄      複数/件数]

┌────────────────────────────┐
│     列A        列B          │
├────────────────────────────┤
│ 🗑  入力欄      入力欄       │
├────────────────────────────┤
│ 🗑  入力欄      入力欄       │
├────────────────────────────┤
│ ＋ 追加   注意書き           │
└────────────────────────────┘
```

UIルール:

- 親の入力欄右側のボタンから開く
- ダイアログ本体は角丸のテーブルとして表示する
- ヘッダー、縦罫線、横罫線を表示する
- ヘッダーと各行の上下余白は詰め気味にし、表としてコンパクトにする
- 追加ボタンのあるフッターは薄いグレー背景にする
- 追加ボタンはフッター左側に置き、注意書きは追加ボタンの横に表示する
- フッターや背景が左下・右下の角丸からはみ出して見えないよう、影と背景はテーブル本体に持たせる
- 行の左端には削除ボタンを置く
- 列内の自由記入 + 候補選択欄は、共通の候補入力UIを使う
- 名前・会社名などのテキスト入力欄の右端には `×` アイコンを置き、押すとその欄の文字を消す。内部IDを連動保持している欄では、文字を消した時に内部IDも空に戻す

開閉ルール:

- `Escape` キーで閉じる
- ダイアログ外クリックで閉じる
- 親の入力欄右側のボタンを再クリックして閉じる
- 何行表示されていても、すべての記入欄が空欄なら例外として閉じられる
- 必須記入欄が埋まっていない場合は閉じられず、追加ボタン横に注意書きを表示する

行追加・削除ルール:

- `＋ 追加` で空行を1行追加する
- 追加された空行は、保存JSONには残さず、表示行数として管理する
- 完全に空の行は削除できる
- 入力済み行は削除ボタンを押しても削除しない
- 入力済み行を削除しようとした場合は、追加ボタン横に注意書きを表示する

保存ルール:

- 保存時は入力のある行だけJSON配列に正規化する
- 表示用の空行は保存しない
- 候補に一致する場合だけIDなどの内部リンク値を保持する
- 候補に存在しない自由入力値も保存できる項目では、名前や値を主データとして保存し、内部リンク値は空欄のまま許可する

現在の適用例:

- 出版社マスターの `related_publishers`

`related_publishers` のテーブルダイアログでは、列名を `関係`、`会社名` とする。会社名は出版社に限らず自由記入でき、出版社マスターに完全一致する場合だけ `publisher_id` を内部保持する。

## リスト選択ダイアログ

マスターデータから選ぶことを前提にした複数入力JSON UIを、今後「リスト選択ダイアログ」と呼ぶ。

基本形:

- 親入力欄はタグ入力と同じUIにする
- 選択済みデータはチップとして表示する
- チップをクリックすると削除できる
- 親入力欄には直接入力できる
- 親入力欄の直接入力では、2文字以上で候補を最大2件表示する
- 候補は親入力欄の直下に表示し、ブラウザ標準の `datalist` には依存しない
- 候補から選んだ値だけ追加できる
- 直接入力した名前がマスターデータに完全一致する場合は追加できる
- マスターデータに存在しない名前は、アラートを出して追加しない
- 日本語IMEの変換中は候補なし判定やUI切り替えを行わない
- 右クリックで詳細なリスト型ダイアログを開く
- 肩書が必要な項目では、候補を選んだだけでは親入力欄へ追加しない
- 肩書が必要な項目では、候補選択後に他候補を消し、選択済み候補だけを表示して、その下に肩書の候補付き自由入力欄を表示する
- 肩書が必要な項目では、肩書を選択または入力して `Enter` を押した時点で、初めて親入力欄へタグとして追加する
- 肩書は空欄でも確定できる
- 親入力欄のタグ表示では読みは表示しない
- 肩書ありのタグ表示は `発行：講談社` のように `肩書：名前` とする

右クリック時のダイアログ:

- ダイアログは `body` 直下に高い `z-index` で表示する
- 親入力欄付近に 280px 幅で表示する
- 上部に検索欄を置く
- 候補リストはコンパクトな2段表示にする
- 1行目に名前、2行目に読みを表示する
- 読みは小さく薄く表示する
- 候補一覧はスクロールできる
- 候補をクリックすると、名前とIDを内部JSONに追加して閉じる
- ダイアログ内クリックでは閉じず、外クリックと `Escape` で閉じる

候補がない場合:

- 検索欄を、上段 `名前`、下段 `読み` の2段フォームに切り替える
- 2段フォームの下に `登録` ボタンを表示する
- `名前` とひらがなの `読み` が入るまで `登録` ボタンは無効にする
- `登録` 実行前に確認ダイアログを1回出す
- 確認OKならマスターデータへ登録し、登録後は候補リストから選択できる状態にする

保存ルール:

- 内部JSONは、表示名とマスターIDだけを持つ
- 読みは参照先マスターデータに持たせ、複数入力JSONには重複保存しない
- ただし、雑誌個別情報の `publishers` と `related_magazines` では、入力時の表示・確認のため `reading` と `role` も保存できる

例:

```json
[
  {"name": "別名義A", "author_id": "A12345"},
  {"name": "別名義B", "author_id": "A67890"}
]
```

現在の適用例:

- 著者マスターの別名義リンク表示用データ
- 雑誌個別情報の `publishers`
- 雑誌個別情報の `related_magazines`

`publishers` の保存例:

```json
[
  {"role": "発行", "name": "集英社", "reading": "しゅうえいしゃ", "publisher_key": "pu_7Hs2pVn8Zd", "publisher_id": "P4080000000"}
]
```

`publishers` の肩書候補:

- 発行
- 発売
- 編集

肩書は空欄でも確定できる。

`related_magazines` の保存例:

```json
[
  {"role": "関連", "name": "週刊少年ジャンプ", "reading": "しゅうかんしょうねんじゃんぷ", "magazine_key": "mt_7Hs2pVn8Zd", "magazine_id": "M119459"}
]
```

## 内部キーと表示IDの分離

全テーブルで、DB内部の主キーと、画面やCSVで扱う表示IDを分離する。

基本方針:

- 参照整合性と一意性の担保は、各テーブルの内部キー `id` で行う
- `id` は `au_7Hs2pVn8Zd...` のような、先頭2文字識別子 + `_` + ランダム文字列の文字列IDを使う
- 文字種は英小文字・英大文字・数字を基本とし、記号は `_` だけに絞る
- `author_id`、`publisher_id`、`magazine_id`、`book_id`、`magazine_issue_id`、`story_id` は表示IDとして残し、`unique not null` で管理する
- 画面表示、検索、CSV入出力、外部とのやり取りでは表示IDを使ってよい
- 外部キー、内部JSONの参照、マージ処理、論理削除の追跡は、原則として内部キー `id` を使う
- `change_requests`、`audit_logs`、`work_histories` のような管理テーブルは、既存どおり `uuid` 主キーでもよい。表示IDが必要なテーブルだけ表示IDを持つ

推奨プレフィックス:

- `authors.id`: `au_`
- `publishers.id`: `pu_`
- `magazine_titles.id`: `mt_`
- `books.id`: `bk_`
- `magazine_issues.id`: `mi_`
- `stories.id`: `st_`
- `content_types.id`: `ct_`

移行方針:

- まず全対象テーブルに内部キー `id` を追加する
- 次に外部キーを表示ID参照から内部キー参照へ切り替える
- UIとAPIでは当面、表示IDを併記しつつ、内部では `id` を主参照として扱う
- 既存の `S0000001` などの表示IDルールは維持し、採番ロジックだけを内部キー生成と分離する
- ランダム文字列長と使用文字種は定数化し、全テーブル共通のID生成関数で発行する

この方針により、表示IDの連番管理と、内部の一意性・参照整合性を切り離せる。

## authors

著者・作者・ペンネームのマスター。

著者は、同名異人と別名義が多いため、`author_name` を一意キーにしない。内部参照は `id`、画面表示やCSVでは `author_id` を使う。

```text
authors

id text primary key
author_id text unique not null
author_name text not null
author_reading text not null
social_links jsonb not null default []
memo text not null default ''
tags text[] not null default []
search_text text not null default ''
is_system_record boolean not null default false
edit_version integer not null default 1

record_status text not null default 'draft'
owner_user_id uuid
created_by uuid
updated_by uuid
submitted_by uuid
approved_by uuid
deleted_by uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
submitted_at timestamptz
approved_at timestamptz
deleted_at timestamptz
delete_reason text
```

必須:

- `author_name`
- `author_reading`

`author_reading` は自動予測補完するが、最終的に人間が確認する。

`author_reading` はひらがなと長音符を基本にする。DBでは空文字だけ禁止し、厳密なかなチェックはAPI/UI側で行う。
読みが不明な著者は、暫定値として `みていぎ` を入れる。

`search_text` はシステム生成の検索用カラムとして扱い、編集UIには表示しない。名前、読み、別名、ID、タグなど検索に必要な値を統合して正規化する。`search_reading` は分離せず、検索用情報は `search_text` にまとめる。

`edit_version` はリアルタイム保存時の楽観的排他に使う。更新時に前回取得した `edit_version` と一致しない場合は、他の保存が先に入ったものとして再読み込みを促す。

`is_system_record` は `著者不明` のようなシステム用レコードに使う。`is_system_record = true` の著者は通常削除できない。

推奨インデックス:

```text
authors(author_reading)
authors(record_status, owner_user_id)
authors(updated_at)
authors using gin(tags)
authors using gin(search_text gin_trgm_ops)
```

`search_text` の部分一致検索には `pg_trgm` を使う。初期マイグレーションで `create extension if not exists pg_trgm;` を実行する。

別名義は `authors` 本体の JSON ではなく、専用のリンクテーブルで管理する。UIでは今まで通り「別名義」と表示し、API層でタグ表示用の配列に変換する。

```text
author_alias_links

author_key_1 text not null references authors(id)
author_key_2 text not null references authors(id)
relation_kind text not null default 'alias'
memo text not null default ''
created_by uuid
created_at timestamptz not null default now()

primary key (author_key_1, author_key_2)
```

制約:

- `author_key_1 <> author_key_2`
- `author_key_1 < author_key_2` の順序で保存し、同じ組み合わせの重複登録を防ぐ
- `relation_kind` は初期値 `alias` のみ
- 参照先の著者が残っている限り、別名義リンクは削除チェックの強い関係として扱う

別名義表示用のAPIレスポンス例:

```json
[
  {"name": "別名義A", "author_id": "A12345"},
  {"name": "別名義B", "author_id": "A67890"}
]
```

UI仕様:

- 親入力欄はタグ入力形式にする
- 直接入力では2文字以上で著者候補を最大2件表示する
- 候補から選ぶか、著者マスターに完全一致する名前だけ追加できる
- 著者マスターに存在しない名前を入力した場合は、アラートを出して追加しない
- 右クリックで、クリック位置付近に高い `z-index` のリスト型ダイアログを出す
- ダイアログ上部に著者検索ボックス、その下に著者一覧をコンパクト表示する
- 著者一覧は著者マスター由来の候補を、読み順で表示する
- 一覧の各行を選ぶと、その著者との別名義リンクを `author_alias_links` に追加し、ダイアログを閉じる
- 一覧には15件前後が見える高さを確保し、残りはスクロールする
- 検索して見つからない場合は、検索欄を `名前` と `読み` の縦2段フォームに切り替える
- `登録` ボタンは、名前とひらがなの読みが入るまで無効にする
- 登録前に確認ダイアログを出し、OKなら著者マスターへ追加する
- 新規登録後は候補リストから選んで `author_alias_links` に追加する
- 新規作成は最低 `author_name` と `author_reading` が必要
- `author_reading` はひらがなで入力する
- 入力済みの別名義リンクはタグ形式で表示する
- 各タグは削除できる
- 既に同じ `author_id` が入っている場合は重複追加しない
- 現在編集中の著者自身は追加できない

運用ルール:

- 自分自身の ID は入れない
- 存在しない `author_id` は入れない
- 重複 ID は入れない
- story や book には、その時点で使われた名義の `author_id` を残す
- 検索時は `author_alias_links` を展開して別名義の作品も拾う
- 同名同読みの著者新規作成は禁止しないが、作成前に重複候補として警告する

編集UIでの表示名:

- `author_alias_links`: 別名義
- `social_links`: SNS
- `tags`: タグ
- `memo`: メモ

`alias_note` は持たない。別名義に関する補足は `author_alias_links.memo` または `authors.memo` に寄せる。

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

編集UIでは `サービス`, `アカウント名`, `URL`, `備考` の4列テーブルとして入力する。初期表示は3行で、行の追加・削除ができる。保存時は入力のある行だけ `social_links` JSON 配列に正規化する。

`service` はプリセット候補あり、自由追加可。

候補:

- X
- BlueSky
- インスタ
- Instagram
- YouTube
- ニコニコ動画
- mix
- mix2
- TikTok
- パトレオン
- Patreon
- Threads
- Facebook
- Pixiv
- Pixiv FANBOX
- Fantia
- note
- BOOTH
- Skeb
- Mastodon
- Misskey
- Tumblr
- LINE
- Discord
- Twitch
- GitHub
- SoundCloud
- Spotify
- Ci-en
- DLsite
- DMM
- FANZA
- Amazon著者ページ
- Wikipedia
- 公式サイト
- ブログ
- メール
- その他

特殊レコード:

- `著者不明`
- `author_reading`: `ちょしゃふめい`
- ID は通常採番を使う

## publishers

出版社マスター。

```text
publishers

id
publisher_id
publisher_name
publisher_reading
address
url
related_link
start_date
end_date
memo

related_publishers

tag
search_text
created_at
updated_at
```

`publishers` も内部主キーは `id` とし、`publisher_id` は表示IDとして `unique not null` で保持する。雑誌マスターや雑誌個別情報からの参照は、段階的に `publishers.id` ベースへ移行する。

必須:

- `publisher_name`
- `publisher_reading`

`publisher_reading` は自動予測補完するが、最終的に人間が確認する。

`search_text` はシステム生成の検索用カラムとして扱い、編集UIには表示しない。名前、読み、別名、IDなど検索に必要な値を統合して正規化する。`search_reading` は分離せず、検索用情報は `search_text` にまとめる。

関連会社:

```json
[
  {"role": "親会社", "name": "集英社", "publisher_key": "pu_7Hs2pVn8Zd", "publisher_id": "P4080000000"},
  {"role": "関連会社", "name": "出版流通会社A", "publisher_key": "", "publisher_id": ""}
]
```

編集UIでの表示名:

- `address`: 住所
- `url`: URL
- `related_link`: 関連URL。肩書、URL、備考の3列テーブルで入力し、JSON配列として保存する
- `start_date`: 設立日
- `end_date`: 終了日
- `related_publishers`: 関連会社。横ラベル形式の自由複数選択欄で入力し、関係、会社名、任意の出版社リンクのJSON配列として保存する。UIでは関係と会社名のみを表示し、IDは意識させない。この項目は出版社に限らず、出版社マスターに存在しない会社名も自由記入できる。会社名が出版社マスターの `publisher_name` と完全一致する場合、または出版社候補から選択した場合のみ、`publisher_key` を内部データとして自動保持し、必要に応じて `publisher_id` も表示用に保持する。関係は空欄を許可し、単なる関連会社名の羅列にも使える。関係候補は、親会社、子会社、関連会社、グループ会社、傘下、前身、後継。雑誌個別情報の `publishers` は出版社情報そのものを確定する項目だが、`related_publishers` は会社名自由記入を主とする補助的な関連情報であり、性質が異なる
- `tag`: タグ
- `memo`: メモ

`description` は持たない。備考は `memo` に寄せる。`predecessor_publisher_ids` と `successor_publisher_ids` は持たず、前身・後継の関係は `related_publishers` に統合する。`publisher_relation_note` も持たない。関連会社に関する補足は `related_publishers` または `memo` に寄せる。

特殊レコード:

- `出版社不明`
- `publisher_reading`: `しゅっぱんしゃふめい`
- ID は通常採番を使う

## magazine_titles

雑誌タイトル単位のマスター。何月号という1冊ではなく、雑誌名そのものを管理する。

```text
magazine_titles

id
magazine_id
title
title_reading
title_variants
publisher_key
first_published_date
closed_date
publication_frequency
issn
jpno
note

related_magazines
relation_note

tag
search_text
search_reading
created_at
updated_at
```

最低限記入欄:

- タイトル
- 読み
- 出版社

対応カラム:

- `title`
- `title_reading`
- `publisher_key`

出版社不明の場合は、空欄にせず `出版社不明` レコードに紐づける。

雑誌マスターは出版社名を直接持たない。出版社名は `publisher_key` から `publishers` を参照して表示する。これにより出版社名を変更した場合も、修正は `publishers.publisher_name` の1箇所だけで済む。

`magazine_titles` も内部主キーは `id` とし、`magazine_id` は表示IDとして `unique not null` で保持する。出版社参照は `publisher_key -> publishers.id` を正とし、`publisher_id` は表示やCSV処理で解決する。

`title_variants` は表記ブレを名前と読みのセットで保持する JSON 配列。

```json
[
  {"title": "COMIC TENMA", "reading": "こみっくてんま"}
]
```

初期取り込みでは、同じ雑誌と判断できる表記ブレは、CSV上で先に出た雑誌名をメインタイトル、後に出た雑誌名を `title_variants` に入れる。例外として `コミックメガストアα` は `こみっくめがすとああるふぁ` と読みを補正し、`コミックメガストア` とは別雑誌として扱う。

`作品.csv` 照合時の追加補正:

- `コミックメガストア`: 出版社は `コアマガジン` として扱う。`作品.csv` 側に残る `白夜書房 / コミックメガストア` は取り込み時に `コアマガジン / コミックメガストア` へ寄せる
- `COMIC XEROS`: メイン表記を `COMIC X-EROS` に修正し、`COMIC XEROS` は表記ブレに残す
- `COMICペンギンセレブ`: `辰巳出版`、`富士美出版` の出版社変更をまたぐ同一誌として扱う。雑誌マスターは1件に統合し、各号の出版社は `magazine_issues.publisher_key` で保持する
- `COMICペンギンクラブ山賊版`: `辰巳出版`、`富士美出版`、`スコラマガジン` の出版社変更をまたぐ同一誌として扱う。雑誌マスターは1件に統合し、各号の出版社は `magazine_issues.publisher_key` で保持する
- `コミックメガストアDEEP`: `コアマガジン` の雑誌として追加する
- `コミックドルフィンJr`: メイン表記を `コミックドルフィンJr.` に修正し、ピリオドなしは表記ブレに残す。読みは `こみっくどるふぃんじゅにあ`
- `MEN'Sドルフィン`: 読みを `めんずどるふぃん` に補正する。`MEN'Sドルフィン'` は表記ブレとして扱う
- `コミックDRYUP`: メイン表記を `コミックDRY-UP` に修正し、ハイフンなしは表記ブレに残す
- `BE-NEW`: 既存の `BENEW` の表記ブレとして扱う

`publication_frequency` は JSON 配列。

```json
["週刊"]
```

雑誌関係:

```json
related_magazines: [
  {"role": "前身", "name": "前身誌名", "magazine_key": "mt_123456", "magazine_id": "M123456"},
  {"role": "後継", "name": "後継誌名", "magazine_key": "mt_345678", "magazine_id": "M345678"},
  {"role": "関連", "name": "関連誌名", "magazine_key": "", "magazine_id": ""}
]
```

`related_magazines` は出版社マスターの `related_publishers` と同じテーブルダイアログ形式で入力する。雑誌マスターDBへの登録は強制せず、雑誌名は自由記入できる。入力した雑誌名が雑誌マスターに完全一致する場合、または候補から選択した場合のみ、`magazine_key` を内部データとして自動保持し、必要に応じて `magazine_id` も表示用に保持する。

`MTID` と `最終巻号` は雑誌マスターでは持たない。前身誌・後継誌は独立項目にせず、`related_magazines` の `role` で表現する。

## books

単行本1冊単位のテーブル。

```text
books

id
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

`books` も内部主キーは `id` とし、`book_id` は表示IDとして `unique not null` で保持する。

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

id
magazine_issue_id

magazine_key
publisher_key
magazine_title
magazine_title_reading
issue_title
issue_title_reading
subtitle
subtitle_reading
publication_frequency
media_format

release_year
release_month
release_day

display_year
display_month
display_day
display_combined_month
display_combined_day

publication_year
publication_month
publication_day
publication_combined_month
publication_combined_day

issue_number

volume_number
total_issue_number
volume_number_displayed
issue_number_combined
volume_issue_note

publishers
publisher_person
editor_person
related_magazines

binding
magazine_code
category
rating

price
size
number_of_pages
is_mitsumine
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

- `magazine_key`
- `magazine_title`

推奨:

- `magazine_title_reading`

`magazine_issues` も内部主キーは `id` とし、`magazine_issue_id` は表示IDとして `unique not null` で保持する。

`magazine_key` を選択した時点で、`magazine_titles` から `title`, `title_reading`, `publisher_key` を参照する。`publisher_key` は `magazine_issues` にも保持し、出版社名が必要な場合は `publishers.id` 経由で解決する。増刊、別冊、特別編集などで通常と異なる出版社情報が必要な場合は、MI保存時に `publishers` JSONへ正規化する。`magazine_title` は null 不可。

MI入力画面を開いた時点で親の雑誌マスターは決まっているため、雑誌個別情報フォーム内に `magazine_title` の編集欄は置かない。親Mは画面上部の選択中表示と登録済みMI一覧に表示し、変更が必要な場合は雑誌マスター編集または履歴/検索から別のMを選び直す。

`media_format`:

- `print`
- `digital`
- `print_and_digital`
- `unknown`

`publication_frequency` は、親の `magazine_titles` では候補として複数値を持てるが、MIではその号に適用する刊行頻度を1つに確定して保存する。
初期投入では9割以上が月刊誌であるため、まず `月刊` を入れ、週刊、月2回刊、隔月刊、不定期刊などの例外は後から個別に補正する。

`media_format` も初期投入では9割以上が紙媒体であるため、まず `print` を入れ、電子版、紙+電子、不明などの例外は後から個別に補正する。

`issue_title` はユーザーが編集する雑誌個別タイトル。`issue_label` は通常直接編集せず、`issue_title` に表示発売、巻号、通巻号、Volなどを組み合わせた表示ラベルとして扱う。登録済み雑誌個別リストや画面上部の選択中表示には `issue_label` を使い、編集欄には `issue_title` を使う。

日付は3系統を持つ。

- 表示年月日: `display_*`
- 発行年月日: `publication_*`
- 発売年月日: `release_*`

年月日を持つ項目は、それぞれ `year`、`month`、`day` に分ける。合併が関係するのは表示年月日、発行年月日、号数のみ。表示年月日合併と発行年月日合併は `month`、`day` のみを持つ。号数合併は1カラムで持つ。

号数・巻号まわり:

- `issue_number`: 主号数
- `volume_number`: 巻
- `total_issue_number`: 通巻号
- `volume_number_displayed`: 号数
- `issue_number_combined`: 号数合併
- `volume_issue_note`: 補助表記巻号・補足

表示年月日、発行年月日など、毎号は確認しない補助項目はMI入力画面では詳細欄に隠す。

MI入力画面の雑誌個別情報は、基本欄と詳細欄のどちらも申請保存対象にする。詳細欄を閉じても値は保持する。

メイン欄で扱う初期項目:

- `issue_title`: 雑誌個別の表記名
- `issue_title_reading`: 雑誌個別の読み
- `publication_frequency`: この号の刊行頻度
- `media_format`: 紙/電子
- `display_year`: 表示年
- `display_month`: 表示月
- `display_day`: 表示日
- `volume_number_displayed`: 号数
- `issue_number_combined`: 号数合併
- `volume_number`: 巻
- `issue_number`: 号
- `total_issue_number`: 通巻号
- `is_special_issue`: 増刊。bool型チェック項目
- `is_mitsumine`: 三峯。bool型チェック項目

詳細欄で扱う初期項目:

- `subtitle`: サブタイトル
- `subtitle_reading`: サブタイトルの読み
- `publishers`: 出版社情報。複数ボタン形式で入力し、保存時は役割つきJSONへ正規化する
- `release_year`: 発売年
- `release_month`: 発売月
- `release_day`: 発売日
- `display_combined_month`: 表示年月日の合併月
- `display_combined_day`: 表示年月日の合併日
- `publication_year`: 発行年
- `publication_month`: 発行月
- `publication_day`: 発行日
- `publication_combined_month`: 発行年月日の合併月
- `publication_combined_day`: 発行年月日の合併日
- `volume_issue_note`: 補助表記巻号
- `related_magazines`: 関連誌。雑誌マスターの関連誌と同じ自由記入選択リスト形式で入力し、保存時はJSONへ正規化する
- `publisher_person`: 発行人
- `editor_person`: 編集人
- `binding`: 製本
- `magazine_code`: 雑誌コード
- `category`: 分類
- `rating`: レイティング
- `price`: 価格
- `size`: 判型・サイズ。自由入力 + 候補選択
- `number_of_pages`: ページ数
- `tag`: タグ
- `note`: 備考

`status` は管理者が決める非表示カラムとして保持し、通常のMI入力フォームには出さない。

`publishers` は、UIでは複数ボタン形式で入力する。保存時は出版社名と出版社IDを役割つきJSONで一体管理する。通常は親の雑誌マスターを選んだ時点で決まるためメイン欄には置かない。増刊、別冊、特別編集などで通常と異なる出版社情報が必要な場合に、詳細欄で確認・補正する。

`related_magazines` は、UIでは複数ボタン形式で入力する。保存時は関連する雑誌をJSON形式で保持する。例: `[{"magazine_id":"M000000","title":"別冊少年ジャンプ","relation":"関連"}]`。

`size` は自由入力を許可しつつ、初期候補として `A5`、`B5`、`AB判`、`B6`、`A6`、`新書`、`四六判` を提示する。

例:

```json
[
  {"role": "発行", "publisher_id": "P4080000000", "name": "集英社"},
  {"role": "発売", "publisher_id": "P4834200000", "name": "ホーム社"}
]
```

MI入力画面には、左側から開くサイドモーダルとして登録済みMI一覧を置く。

- 雑誌タイトル選択後、その `magazine_id` に紐づく登録済みMIを取得
- 発売日の古い順に並べる
- 閉じている時は、左端に少しだけ見えるタブボタンを表示する
- タブボタンを押すと、半透明グレーの背景を被せ、リスト以外は操作できない状態にする
- 登録済みMIをクリックすると、そのMIを編集画面へ反映してモーダルを閉じる
- 未登録号の推測や「全何冊中何冊」は初期実装では行わない

## magazine_issues.contents

雑誌個別の中身編集は、作品リストと一般コンテンツを分ける。

理由:

- 漫画作品と、表紙・目次・広告・記事などでは列の意味が異なる
- 雑誌個別編集の主役は作品リストである
- 1つのテーブルにまとめると、列見出しと入力項目の整合性が取りにくい

UIでは以下の2つのBOXに分ける。

```text
作品リスト
コンテンツ
```

`contents` は、最終的には雑誌内コンテンツ一覧を JSON 配列で持つ。ただし入力UIでは、作品リストを先に、一般コンテンツを後に表示する。

初期表示は軽くする。

```text
作品リスト:
story入力行

コンテンツ:
表紙
目次
裏表紙
```

表紙・目次・裏表紙は一般コンテンツ側の初期行として用意する。

基本構造:

```json
[
  {
    "position": 1,
    "content_type": "cover",
    "title": "表紙",
    "contributors": [
      {"role": "イラスト", "name": "えーすけ", "author_id": "A000000"}
    ],
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

表紙コンテンツの著者・作者は、コンテンツ種別ではなく担当肩書として `イラスト` を使う。UI表示は `種別: 表紙`、関係者は `[イラスト]えーすけ` のように表示する。

1ページ内に複数コンテンツが混在する場合があるため、ページ番号と行を一対一に固定しない。

作品リストのデフォルト項目:

```text
position
title
contributors
story_type
page_count
```

`story_type` は初期投入では決め打ちする。話数、または話数表記があるものは `連載`、ないものは `読み切り` とする。編集画面では必要に応じて修正できる。

初期候補:

- `読み切り`
- `連載`

作品リストの詳細1段目:

```text
series_title
series_title_reading
subtitle
subtitle_reading
```

作品リストの詳細2段目:

```text
episode_number_sort
episode_number
color_info
```

作品リストの詳細3段目:

```text
memo
tag
```

`初回`、`最終回` は固定チェック項目にせず、タグで表現する。

作品リストの行操作:

- 右端に詳細開閉ボタンと `…` 操作メニューを上下配置する
- `…` メニューには `上にコピー`、`下にコピー`、区切り線、`削除` の順に置く
- `上にコピー` は同じ内容の行を現在行の上へ追加する
- `下にコピー` は同じ内容の行を現在行の下へ追加する
- 入力済み行を削除する場合は、確認ダイアログを1回出す
- 空行を削除する場合は、確認なしで削除する
- コピー・削除後は `position` を1から振り直す

著者入力:

- 著者名は `authors` マスターからオートコンプリート候補を出す
- 入力中の文字を含む候補を、入力欄の下に最大5件表示する
- 候補検索は `author_name` と `author_reading` の両方を対象にする
- ひらがな読みで入力した場合も、候補表示は正式な著者名を出す。例: `やまだ` → `山田太郎`
- 通常の著者入力欄と、複数記入欄の著者名欄の両方で同じ候補表示を使う
- 候補を選ぶと著者名欄へ反映する
- 候補がない場合でも自由入力は許可し、未解決候補として承認時チェックの対象にする

一般コンテンツのデフォルト項目:

```text
position
content_type
contributors
page_start
page_end
```

`content_type` は自由記入も可能な候補入力にする。ただし、漫画・story は一般コンテンツでは選ばない。漫画作品は作品リスト側で扱う。

一般コンテンツのメイン行は横ラベル形式で、以下の順に並べる。

```text
種別
関係者
SP
EP
```

`関係者` は、作品リストの `著者` と同じ複数記入欄UIを使う。

`SP` はスタートページ、`EP` はエンドページ。ページ入力部分は横幅50px固定、文字は中央寄せにする。

一般コンテンツの詳細:

```text
detail
```

詳細はラベル付きテキストエリア1つで管理する。

一般コンテンツの行操作:

- 右端に `…` 操作メニューと詳細開閉ボタンを横配置する
- `…` メニューには `上にコピー`、`下にコピー`、区切り線、`削除` の順に置く
- `上にコピー` は同じ内容の行を現在行の上へ追加する
- `下にコピー` は同じ内容の行を現在行の下へ追加する
- 入力済み行を削除する場合は、確認ダイアログを1回出す
- 空行を削除する場合は、確認なしで削除する
- コピー・削除後は `position` を1から振り直す

`episode_number` の自動推測はしない。

`color_info` は自由記入。

`memo` は通常検索対象外。検索オプションで「メモまで検索する」を有効にした場合のみ対象。

## stories

単話データベース。雑誌掲載だけでなく、将来は単行本の中身にも使う。

```text
stories

id
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

`stories` も内部主キーは `id` とし、`story_id` は表示IDとして `unique not null` で保持する。入力者はどちらのIDも意識しない。

`story_type`:

- `serial`: 連載
- `one_shot`: 読み切り
- `extra`: 番外編
- `side_story`: 外伝
- `unknown`: 不明

初期投入時の `story_type` は、`episode_number` または `episode_number_sort` があれば `serial`、どちらもなければ `one_shot` にする。`extra`、`side_story`、`unknown` は後から手動編集・分類する場合の予備値として残す。

`series_title_reading` と `subtitle_reading` は、元になる `series_title` / `subtitle` が空欄の場合は空欄でよい。対応するタイトルが入っている場合のみ、読みはひらがなと長音「ー」で保存する。

重複が後から見つかった場合は統合する。

- 残す story に参照を寄せる
- 古い story は `status=merged`
- `merged_into_story_id` は当面表示IDを保持してもよいが、最終的には `merged_into_story_key -> stories.id` へ移行する

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

著者、表紙イラスト担当などは、共通の関係者入力 UI を使う。出版社は名前とIDを同じJSONオブジェクトで保持するため、`publishers` 用の役割つきJSON入力として扱う。

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

## タイトル・読み入力UI

タイトルと読みがセットになっている入力欄は、縦型の共通UIにする。

基本形:

```text
┌──────────────────────────┐
│ 作品タイトル              │
├──────────────────────────┤
│ 作品タイトルの読み          │  補完無し
└──────────────────────────┘
```

読み欄はタイトル欄より小さい文字で表示する。

対象:

- 雑誌マスター名 + 読み
- 雑誌マスタータイトル表記ブレ + 読み
- 雑誌個別表記名 + 読み
- 単行本タイトル + 読み
- 作品タイトル + 読み
- シリーズ名 + 読み
- サブタイトル + 読み
- 著者名 + 読み
- 出版社名 + 読み

読み補完:

- タイトル入力時に、読み欄へ補完候補をライブ入力できる
- 補完は補助であり、最終的には人間が確認する
- 読み欄をユーザーが手修正した場合は、その入力欄では手入力を優先する
- 読み欄右端に `補完無し` / `補完あり` のトグルボタンを置く
- トグル状態は、同じ画面内の読み入力欄すべてに適用する
- 将来的には、トグル設定を `user_profiles.input_preferences` に保存する

読みバリデーション:

- 読み欄は空欄を許可する
- 読み欄に入力がある場合は、ひらがなと長音「ー」のみ許可する
- ひらがな・長音「ー」以外が入力されている場合は、入力欄のフォーカスアウト時にアラートダイアログを出す
- 保存申請、正式DB書き込み、承認反映のタイミングでも同じバリデーションを必ず実行する
- バリデーション対象は、雑誌マスター、雑誌個別、単行本、作品、シリーズ、サブタイトル、著者、出版社など、読み欄を持つすべての項目とする

数値バリデーション:

- 雑誌個別情報の `release_year`、`release_month`、`release_day`、`display_year`、`display_month`、`display_day`、`display_combined_month`、`display_combined_day`、`publication_year`、`publication_month`、`publication_day`、`publication_combined_month`、`publication_combined_day`、`issue_number`、`volume_number`、`total_issue_number`、`number_of_pages`、作品リストの `page_count`、`episode_number_sort`、一般コンテンツの `page_start`、`page_end` は数字入力として扱う
- 全角数字で入力された場合は、入力欄のフォーカスアウト時に半角数字へ変換する
- 全角小数点 `．`、句点 `。` は半角小数点 `.` へ変換する
- 空欄は許可する
- 入力がある場合は、数字のみ、または小数点を1つ含む数字のみ許可する
- 数字ではない文字が含まれる場合は、フォーカスアウト時にアラートダイアログを出す
- 保存申請、正式DB書き込み、承認反映のタイミングでも同じバリデーションを必ず実行する

カラム単位の保存例:

```json
{
  "reading_prediction": {
    "default_enabled": true,
    "disabled_columns": [
      "stories.title_reading"
    ]
  }
}
```

`disabled_columns` に入ったカラムでは、タイトルを変更しても読み欄を自動更新しない。

保存時は、読みそのものは各正式テーブルの `*_reading` に保存する。`input_preferences` には読み予測のON/OFF設定だけを保存する。

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

## 作業履歴

ユーザーが直近で作業した対象を再開しやすくするため、UI再開用の作業履歴テーブルを持つ。

正式な監査証跡は `audit_logs` に残す。`work_histories` は、画面表示や作業再開のための軽い履歴として扱う。

ユーザーDBに履歴配列を直接持たせるのではなく、履歴テーブル側に `user_id` を持たせてユーザーと操作履歴を紐づける。

履歴は以下を分担する。

- 各データ本体: `updated_by`, `updated_at`, `record_status` など、現在状態の管理情報を持つ
- `work_histories`: ユーザーが最近作業した対象を再開するための軽い履歴を持つ
- `audit_logs`: 誰が何を変更・申請・承認したかの正式な監査証跡を持つ

想定テーブル:

```text
work_histories
```

カラム:

```text
work_history_id
user_id
context
target_type
target_id
target_label
parent_type
parent_id
parent_label
last_action
work_count
metadata
last_worked_at
created_at
updated_at
```

`context` は、どの画面・機能で使う履歴かを表す。

例:

- `magazine_issue_editor`: 雑誌個別編集
- `magazine_title_editor`: 雑誌マスター編集
- `book_editor`: 単行本編集
- `author_editor`: 著者編集
- `publisher_editor`: 出版社編集

`target_type` は作業履歴の主対象。

例:

- `magazine_title`
- `magazine_issue`
- `book`
- `author`
- `publisher`
- `story`

雑誌個別編集では、MIは必ずMに紐づくため、履歴はM単位でまとめる。

例:

```text
context: magazine_issue_editor
target_type: magazine_title
target_id: M119459
target_label: 週刊少年ジャンプ
last_action: edit_magazine_issue
metadata: {"publisher":"集英社","last_issue_label":"2024年34号"}
```

同じユーザーが同じ `context + target_type + target_id` を再度作業した場合は、履歴行を増やさず、既存行を更新する。

更新する項目:

- `last_action`
- `work_count`
- `metadata`
- `last_worked_at`
- `updated_at`

雑誌個別画面を開く時は、ログインユーザーの `magazine_issue_editor` 履歴を最新20件取得する。

```sql
select *
from work_histories
where user_id = :user_id
  and context = 'magazine_issue_editor'
  and target_type = 'magazine_title'
order by last_worked_at desc
limit 20;
```

履歴が取得できる場合:

- 先頭のMを「最後に作業したM」として自動選択する
- ボディヘッダーの「履歴」ボタンから最新20件を選べる
- 選択したMの雑誌個別編集画面へ移動する

履歴がない、または取得に失敗した場合:

- 雑誌個別編集フォームは開かない
- 「雑誌マスター編集へ」ボタンを表示する
- 雑誌マスター編集でMを検索し、該当Mから雑誌個別編集へ移動する

想定制約:

```sql
unique (user_id, context, target_type, target_id)
```

想定インデックス:

```sql
create index work_histories_user_context_worked_at_idx
on work_histories (user_id, context, last_worked_at desc);

create index work_histories_target_idx
on work_histories (target_type, target_id);
```

DDL案:

```sql
create table work_histories (
  work_history_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  context text not null,
  target_type text not null,
  target_id text not null,
  target_label text not null,
  parent_type text,
  parent_id text,
  parent_label text,
  last_action text not null,
  work_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  last_worked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_histories_unique_target
    unique (user_id, context, target_type, target_id)
);

create index work_histories_user_context_worked_at_idx
on work_histories (user_id, context, last_worked_at desc);

create index work_histories_target_idx
on work_histories (target_type, target_id);
```

## メッセージ基盤

メンバー間のやり取りは、原則として参加者全員が見える全体共有型のメッセージ基盤として扱う。

ただし、見え方は混雑を避けるために分ける。

- `general`: 一般メッセージ
- `application`: 申請、保留、承認、却下、再申請などの申請系メッセージ

保存は一元化し、表示だけを分ける。

この方針により、監査性と検索性を保ちながら、申請系の多い時系列と通常連絡を分離できる。

### メッセージ設計の基本方針

- メッセージの保存先は申請専用と一般連絡用で分けない
- すべてのメッセージは共通のスレッドとメッセージテーブルへ保存する
- 一般メッセージと申請メッセージの違いは `thread_type` と `message_type` で区別する
- 申請状態そのものは `application_requests` で管理し、メッセージは状態管理の代用にしない
- 申請や承認で送られた文面も、正式にはメッセージ履歴として残す
- 一般メッセージの一覧と、申請・認証の一覧は UI 上では分ける
- 初期段階ではメッセージの削除、編集、添付ファイル、リアクションは持たない

### 想定テーブル

```text
message_threads
messages
message_reads
```

#### message_threads

スレッド本体を持つ。

```text
message_thread_id
thread_type
title
visibility_scope
application_group_id
created_by_user_id
created_at
updated_at
last_message_at
last_message_preview
last_message_type
last_message_by_user_id
is_closed
metadata
```

`thread_type`:

- `general`
- `application`

`visibility_scope`:

- `all_members`

初期段階では全スレッドを `all_members` とし、参加メンバー個別管理テーブルは持たない。

`application_group_id`:

- `thread_type = application` のとき、申請セット単位の識別子を入れる
- 一般メッセージでは `null`

`is_closed`:

- 申請スレッドの処理が完了し、通常は新規発言を止めたい場合に備えたフラグ
- 初期実装では `false` のままでもよいが、将来の運用拡張を見越して持たせる

`metadata` 例:

```json
{
  "linked_entity_type": "magazine_issue_set",
  "linked_entity_id": "MI0003431",
  "application_status": "submitted"
}
```

#### messages

各発言とシステムイベントを持つ。

```text
message_id
message_thread_id
sender_user_id
message_type
body
event_type
application_request_id
application_group_id
created_at
metadata
```

`message_type`:

- `text`: 人が書いた通常メッセージ
- `system`: システムが記録する申請・承認イベント

`event_type` 例:

- `application_submitted`
- `application_on_hold`
- `application_approved`
- `application_rejected`
- `application_withdrawn`
- `comment`
- `note`

`application_request_id`:

- 個別申請行に紐づく場合だけ入れる
- 申請セット全体を扱う通知では `null` でもよい

`application_group_id`:

- 申請スレッド内のイベントやコメントに入れる
- 一般メッセージでは `null`

`metadata` 例:

```json
{
  "from_status": "submitted",
  "to_status": "on_hold",
  "request_ids": ["AR000003", "AR000004"],
  "entity_titles": ["申請テスト雑誌セット", "申請テスト雑誌セット 2099年01月号"]
}
```

#### message_reads

ユーザーごとの既読位置を持つ。

```text
message_thread_id
user_id
last_read_message_id
last_read_at
created_at
updated_at
```

目的:

- アカウントボタンやメッセージ一覧に未読件数バッジを出す
- 一般メッセージと申請メッセージの未読を分けて集計できるようにする

初期段階では、未読管理はスレッド単位の最終既読だけを持てば十分とする。

### DDL案

```sql
create table message_threads (
  message_thread_id uuid primary key default gen_random_uuid(),
  thread_type text not null check (thread_type in ('general', 'application')),
  title text not null,
  visibility_scope text not null default 'all_members'
    check (visibility_scope in ('all_members')),
  application_group_id text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_message_type text not null default 'text'
    check (last_message_type in ('text', 'system')),
  last_message_by_user_id uuid references public.users(id) on delete set null,
  is_closed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,

  constraint message_threads_application_group_required
    check (
      (thread_type = 'application' and application_group_id is not null and btrim(application_group_id) <> '')
      or
      (thread_type = 'general' and application_group_id is null)
    )
);

create unique index message_threads_application_group_idx
on message_threads (application_group_id)
where thread_type = 'application';

create index message_threads_type_last_message_idx
on message_threads (thread_type, last_message_at desc nulls last);

create table messages (
  message_id uuid primary key default gen_random_uuid(),
  message_thread_id uuid not null references message_threads(message_thread_id) on delete cascade,
  sender_user_id uuid references public.users(id) on delete set null,
  message_type text not null check (message_type in ('text', 'system')),
  body text not null default '',
  event_type text,
  application_request_id text,
  application_group_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index messages_thread_created_at_idx
on messages (message_thread_id, created_at asc);

create index messages_application_group_idx
on messages (application_group_id, created_at asc)
where application_group_id is not null;

create table message_reads (
  message_thread_id uuid not null references message_threads(message_thread_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_read_message_id uuid references messages(message_id) on delete set null,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (message_thread_id, user_id)
);

create index message_reads_user_last_read_idx
on message_reads (user_id, last_read_at desc nulls last);
```

## 申請テーブルとの連携

申請状態の真実は `application_requests` に置き、会話と通知は `message_threads` / `messages` に置く。

責務分担:

- `application_requests`: 現在の状態、対象、依存関係、申請者、承認者
- `message_threads`: 申請セット単位の会話のまとまり
- `messages`: 申請イベントと人間の補足メッセージ
- `audit_logs`: 正式な操作監査

### application_requests 側で持つべきもの

現在の `metadata` だけに寄せず、申請スレッドと結ぶためのカラムを明示的に持つ。

追加、または独立カラム化を推奨するもの:

```text
application_group_id
message_thread_id
```

`application_group_id`:

- 親子申請を1セットで扱うための共通 ID
- 申請、保留、承認、却下の単位は基本これで揃える
- 既存の `metadata.dependencyGroupId` を将来的にはこの独立カラムへ移す

`message_thread_id`:

- その申請セットに対応する `message_threads.message_thread_id`
- `application_requests` 全行で同じセットなら同じ値を持つ

DDL 変更案:

```sql
alter table public.application_requests
  add column application_group_id text,
  add column message_thread_id uuid references public.message_threads(message_thread_id) on delete set null;

create index application_requests_group_status_idx
on public.application_requests (application_group_id, status, updated_at desc);

create index application_requests_message_thread_idx
on public.application_requests (message_thread_id, updated_at desc);
```

`application_group_id` は将来的に `not null` に寄せるのが望ましい。ただし既存データ移行期間中は `null` を許可してよい。

### 申請時の処理

editor が申請する時:

1. 対象レコード群から `application_group_id` を確定する
2. `thread_type = application` の `message_threads` を1件作成する
3. その `message_thread_id` を、同じ申請セットの `application_requests` に書く
4. `messages` に `message_type = system`, `event_type = application_submitted` を1件追加する
5. 必要なら申請者の補足文を `message_type = text` で続けて追加する

自動作成される system message 例:

```text
申請テスト雑誌セット、申請テスト雑誌セット 2099年01月号 を申請しました
```

### 保留、承認、却下時の処理

admin が保留、承認、却下する時:

1. `application_requests.status` を更新する
2. `reviewer_user_id`, `reviewed_at`, `reviewer_note` を更新する
3. 同じ `message_thread_id` に system message を追加する
4. admin が入力した文面を、同じメッセージの `body`、または続く `text` message として残す

system message の例:

- `application_on_hold`: `〇〇を保留にしました`
- `application_approved`: `〇〇を認証しました`
- `application_rejected`: `〇〇を却下しました`

`reviewer_note` は一覧高速表示用の最新メッセージ写しとして残してよいが、正式な会話履歴は `messages` を正とする。

### editor からの補足返信

初期段階では、editor も申請スレッドへ追記できるようにする。

- `application` スレッドにも `message_type = text` の投稿を許可する
- これにより、保留理由への返答、再申請時の補足、状況確認を同じ時系列で扱える

ただし状態遷移自体は、メッセージ投稿では変えない。

- 再申請は `application_requests.status = submitted` と system message の追加をセットで行う
- 単なる返信は `messages` 追加だけでよい

### 一般メッセージとの分離

保存先は共通だが、一覧取得は分ける。

一般メッセージ一覧:

```sql
select *
from message_threads
where thread_type = 'general'
order by last_message_at desc nulls last;
```

申請、認証一覧:

```sql
select *
from message_threads
where thread_type = 'application'
order by last_message_at desc nulls last;
```

この分離により、全員閲覧型でありながら、申請系の大量更新に一般連絡が埋もれにくくなる。

## 承認フロー

各主要テーブルは `record_status` で `draft`, `submitted`, `published` を管理する。ドラフト専用テーブルは原則として分けない。

保存はリアルタイムで行う。ただし、リアルタイム保存されたデータは `record_status` によって通常閲覧から隠す。

基本遷移:

```text
新規作成 -> draft
入力・編集 -> draft のままリアルタイム保存
保存申請 -> submitted
申請取り下げ -> draft
承認 -> published
削除申請 -> change_requests.action = delete
削除承認 -> deleted
```

一般ユーザーの申請操作:

- 一般ユーザーはアカウントボタン内の `編集中` タブから、自分の `draft` データを確認する
- `編集中` リストの下部にある `申請` ボタンで、選択したデータを `submitted` に移動する
- `submitted` に移動したデータは、申請者本人であっても編集画面では読み取り専用にする
- 申請者本人は、承認前であれば `申請中` タブから `編集中に戻す` を実行できる
- `編集中に戻す` を実行したデータは `draft` に戻り、再編集できる
- 承認済みで `published` になったデータは、この申請取り下げ操作の対象外にする

2026-07-01 実装修正メモ:

- 公開済みデータを専門家が編集した場合、公開中の本体レコードを `draft` に落としてはいけない
- 公開済み本体は `published` のまま保持し、未承認の変更内容は `application_requests` 側に保持する
- これにより、承認前の修正が通常閲覧データへ混ざる事故を防ぐ
- `submitted` と `on_hold` の申請が存在する対象は、API 側で更新と削除を拒否する
- 同じ対象を編集画面で開いた場合、UI 側でも `申請中の閲覧モード` として扱い、入力・追加・削除を無効化する
- `編集中に戻す` が完了した対象だけ、再び通常の `編集モード` に戻す
- このロック対象は著者、出版社、雑誌マスター、雑誌個別の4系統すべてでそろえる
- 見た目だけ編集できそうに見える状態を避けるため、申請中は入力欄、タグ、関連選択、SNS、関連URLの各 UI も disabled または readOnly 表示にそろえる
- 公開済みの雑誌個別にぶら下がる `stories` と `contents` の変更も、公開中本体へ直接書かず、親の `application_requests.metadata` にドラフト状態を丸ごと保持する
- 雑誌個別の申請一覧・編集画面・承認処理は、この `metadata.stories` / `metadata.contents` を同じ情報源として扱い、表示と正式反映でずれないようにする
- つまり、公開済み issue 配下の `story` 追加・修正・削除は「story 単体申請」ではなく「親 issue の update 申請の一部」として扱う
- 雑誌個別画面のルーティングでは、`/magazines/:magazineId/issues/:issueId` の URL を一次情報として扱う
- `selectedMagazine` のような画面内メモリ状態は補助情報とし、URL と `selectedIssue.magazineId` から親雑誌を復元できる構造を維持する
- 既存 issue の `draft` 申請表示と、未保存の新規 issue は別概念として扱い、`status = draft` だけで `/issues/new` 判定をしてはいけない
- 同様に、保存済みの `draft` issue は通常の既存 issue として保存、Undo、作品編集、削除判定の対象に含め、`NEW-` 仮IDの未保存状態だけを別扱いする
- `selectedMagazine` を更新する時は、複数箇所で直接 `setSelectedMagazine` せず、同じ雑誌IDなら既存コンテキストを保ちながら更新する共通 helper を通す
- 雑誌名の表示値は `selectedMagazine.title`、`selectedIssue.magazineTitle`、`issueForm.magazineTitle` を個別に信用せず、共通の解決順で正規化する
- `applyIssueToForm`、保存後の `savedIssue` 反映、URL直開き、履歴選択は、すべて同じ雑誌タイトル解決ルールを使う
- `stories` と `contents` の配列反映は、「APIレスポンスに配列が含まれる時だけ置き換え、未指定なら現在値を維持する」共通ルールで統一する
- `applyParsedRoute` の `mi` 分岐は、`issue` の選択ロジックと画面 state 反映ロジックを helper に分け、URL解釈と表示反映を混ぜない
- 再読込直後や履歴移動直後の route 適用中は、`MissingMagazinePanel` を即表示せず、`雑誌個別を読み込んでいます。` の一時表示を優先する
- つまり、`activeMagazine` が一瞬 `null` になる過渡状態を「M未選択」と誤判定してはいけない

公開済みデータを編集する場合も、まず編集状態を明確にし、承認前の変更が通常閲覧に混ざらないようにする。初期実装では `record_status` と操作履歴で管理し、将来的に差分管理が必要になった場合は `change_requests` の `before_data` / `after_data` を拡張する。

想定テーブル:

```text
change_requests
audit_logs
work_histories
```

`work_histories` は承認対象ではなく、UI再開用の補助テーブルとして扱う。

`audit_logs` はユーザー操作履歴の正式な記録として扱う。

`audit_logs` の想定項目:

```text
audit_log_id
user_id
action_type
target_table
target_id
target_label
before_data
after_data
created_at
```

`action_type` 例:

- `create_draft`
- `update_draft`
- `submit`
- `withdraw_submission`
- `approve`
- `reject`
- `publish`
- `delete_request`
- `delete_approve`
- `delete_reject`
- `restore`

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
- `on_hold`
- `approved`
- `rejected`

MI入力中はリアルタイムで `magazine_issues` に保存する。ただし `record_status = draft` または `submitted` のデータは通常閲覧には表示しない。

`contents` の正式確定タイミングは、MI 1件まるごとの承認時。

承認時に行うこと:

- MI本体の `record_status` を `published` にする
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
- 同じ `magazine_id + display_year/display_month/display_day + issue_number` の MI がないか
- 同じ `magazine_id + volume_number_displayed + issue_number` の MI がないか
- `content_type` が `content_types` に存在するか
- `position` が重複していないか
- story 候補が既存 story と重複していないか
- 未解決の著者・出版社がないか
- ページ番号がある場合、逆転していないか
- ページ番号がある場合、総ページ数を超えていないか
