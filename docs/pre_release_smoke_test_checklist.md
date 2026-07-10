# Pre-release Smoke Test Checklist

最終更新: 2026-07-10

## Purpose

公開前に最低限確認すべき項目を 1 枚にまとめる。
この表は、実装の完成度ではなく「公開前にどこまで実機確認できたか」を管理するために使う。

## Status Legend

- `confirmed-now`
  - 今回の確認サイクルで、実機またはビルドで確認済み
- `confirmed-before`
  - 以前のローカル確認で通っているが、今回サイクルでは未再確認
- `pending`
  - 未確認、または公開前に再確認したい
- `needs-rule`
  - テスト前に運用ルール確定が必要

## Release Gate

最低限、次の 4 条件を満たしてから公開判断に入る。

1. `404` `db-unavailable` `unexpected` の振り分け方針が固定されている
2. 主要 CRUD と CSV と Undo が 1 回ずつ実機確認されている
3. 申請・メッセージ・ユーザー管理の管理系導線が実機確認されている
4. 本番ビルドが通る

## Checklist

| Category | Screen / Flow | What to confirm | Status | Notes |
| --- | --- | --- | --- | --- |
| Build | Production build | `npm run build` が通る | `confirmed-now` | 2026-07-09 に確認済み |
| Route | Unknown URL | 不正 URL が 404 画像へ遷移する | `confirmed-now` | `/not-a-real-page` で確認済み |
| Route | DB unavailable route | DB 不通時に `/errors/db-unavailable` へ遷移する | `confirmed-now` | 今回サイクルで複数導線を確認済み |
| Route | Unexpected route preview | `/errors/unexpected` で 500 画像が出る | `confirmed-now` | プレビュー表示を確認済み |
| Rule | API 500 handling | 通常 500 は画面内エラー、DB 不通のみ全画面とする | `confirmed-now` | `docs/error_route_policy.md` に固定済み |
| Auth | Login | ログイン成功・失敗・ログアウト | `confirmed-now` | 2026-07-10 に正常系を確認済み |
| Authors | Master list load | 一覧表示・検索・選択 | `confirmed-now` | 2026-07-10 に一覧・検索・選択を実機確認済み |
| Authors | Master save | 新規作成・保存・削除 | `confirmed-now` | 2026-07-10 に通常保存の往復確認済み |
| Authors | DB unavailable | 保存時に全画面 DB 不通へ遷移 | `confirmed-now` | 今回サイクルで確認済み |
| Authors CSV | Download / template / upload / undo | 4 系統が正常に動く | `confirmed-before` | 以前のローカル確認あり |
| Publishers | Master list load | 一覧表示・検索・選択 | `confirmed-now` | 2026-07-10 に一覧・検索・選択を実機確認済み |
| Publishers | Master save | 新規作成・保存・削除 | `confirmed-now` | 2026-07-10 に通常保存の往復確認済み |
| Publishers | DB unavailable | 保存時に全画面 DB 不通へ遷移 | `confirmed-now` | 今回サイクルで確認済み |
| Publishers CSV | Download / template / upload / undo | 4 系統が正常に動く | `confirmed-before` | D&D と Undo は以前の確認あり |
| Magazines | Master list load | 一覧表示・検索・選択 | `confirmed-now` | 2026-07-10 に一覧・検索・選択を実機確認済み |
| Magazines | Master save | 新規作成・保存・削除 | `confirmed-now` | 2026-07-10 に通常保存の往復確認済み |
| Magazines | DB unavailable | 保存時に全画面 DB 不通へ遷移 | `confirmed-now` | 今回サイクルで確認済み |
| Magazines CSV | Download / template / upload / undo | 4 系統が正常に動く | `confirmed-before` | 以前のローカル確認あり |
| MI | Issue load | 既存雑誌個別の表示と遷移 | `confirmed-now` | 今回サイクルで継続使用中 |
| MI | Issue save | 雑誌個別本体の保存 | `confirmed-now` | DB 不通遷移を含め確認済み |
| MI | Story operation | 作品作成・保存・削除 | `confirmed-now` | 今回は削除導線で DB 不通確認済み |
| MI | Content operation | コンテンツ作成・保存・削除 | `confirmed-now` | 2026-07-10 に contents 保存の往復確認済み |
| MI | selectedMagazine stability | 画面遷移時に欠落せず復元できる | `confirmed-before` | 以前の修正後、今回大きな再発なし |
| Undo | Issue undo | 雑誌個別の Undo が動く | `confirmed-now` | DB 不通時の全画面遷移も確認済み |
| Undo | Upload undo | CSV 単位の Undo が動く | `confirmed-before` | 雑誌・出版社で以前確認済み |
| Applications | List / history | 申請一覧と履歴が開く | `confirmed-now` | 今回サイクルでダイアログ表示確認済み |
| Applications | Review action | 承認・保留・却下の少なくとも 1 つ | `confirmed-now` | `全部を承認` の DB 不通遷移を確認済み |
| Messages | General / application threads | 一覧・投稿・状態変更 | `confirmed-now` | 2026-07-10 に一般スレッドの作成・投稿・既読・クローズ・再開を確認済み |
| Messages | DB unavailable | メッセージ画面で全画面 DB 不通へ遷移 | `confirmed-now` | 今回サイクルで確認済み |
| Work history | Load / upsert | 操作履歴が読めて更新される | `confirmed-now` | 2026-07-10 に読込・upsert・再読込を確認済み |
| Work history | DB unavailable | 履歴保存・読込時に DB 不通へ遷移 | `confirmed-now` | 今回サイクルで API 側対応を整理済み |
| Users | User management load | ユーザー管理画面が開いて一覧を読む | `confirmed-now` | DB 不通導線も確認済み |
| Users | DB unavailable | ユーザー管理で DB 不通へ遷移 | `confirmed-now` | フッターメニュー導線で確認済み |
| View mode | Desktop / mobile behavior | PC は編集モード既定、スマホは View モード既定 | `confirmed-now` | 2026-07-10 に PC/スマホ両方の既定表示を実機確認済み |
| Footer / account menu | Navigation | フッターメニューとアカウントメニューの主要項目 | `pending` | 管理系導線が増えたため再確認推奨 |
| Performance | Large list search | 著者・出版社・雑誌マスターの検索体感 | `pending` | 公開前に大きいデータで触感確認したい |
| Deployment | Local to deploy parity | 環境変数・画像・エラーページ・DB 接続設定 | `confirmed-now` | 2026-07-10 に棚卸し完了。実値投入と初回デプロイ後確認は [deployment_readiness.md](/Volumes/DATA4%208T/myprogram/Codex/mymag/docs/deployment_readiness.md) を参照 |

## Recommended Next Test Pass

次のテストは、以下の順でまとめて行うと効率が良い。

1. 正常系の再確認
   - ログイン
   - 著者 / 出版社 / 雑誌マスターの通常保存
   - 雑誌個別のコンテンツ保存
   - メッセージ正常投稿
2. CSV 系の再確認
   - 雑誌
   - 出版社
   - 著者
3. レスポンシブ確認
   - スマホ幅
   - View モード
4. デプロイ前確認
   - 画像アセット
   - 環境変数
   - 本番 DB 接続

## Notes

- `confirmed-before` の項目は、公開前に余力があれば 1 回だけでも再確認したい
- `confirmed-now` でも、UI を大きく触ったあとには再確認対象へ戻す
- この表は「全部を毎回やる」ためではなく、「未確認のまま公開しない」ために使う
