# Deploy Runbook

最終更新: 2026-07-10

## Scope

この手順書は、現行 `mymag` をまず **テストデプロイ** し、
ローカル修正をすぐグローバルURLで確認できる状態を作るための最小手順をまとめたもの。

- ホスティング先: Vercel 想定
- DB: Supabase Postgres
- 対象アプリ: `app/` 配下の Next.js アプリ

## Goal

今回の目的は、本番公開ではなく次のループを成立させること。

1. ローカルで修正する
2. GitHub へ push する
3. Vercel が自動でテストデプロイする
4. グローバル URL で修正結果を確認する

この段階では、Vercel も Supabase もテスト用環境を使う。

## 事前前提

次の 3 点がそろっていること。

1. GitHub 上にこのリポジトリがある
2. テスト用 Supabase Postgres の接続情報がある
3. `YAHOO_CLIENT_ID` を使える

## テスト環境変数

Vercel の Preview には最低限、次を登録する。

```env
PGHOST=...
PGPORT=...
PGUSER=...
PGDATABASE=...
PGPASSWORD=...
PGSSLMODE=require
PGSSLREJECTUNAUTHORIZED=true
YAHOO_CLIENT_ID=...
KANA_KURONEKO_API_URL=https://eng-jpn-api.krnk.org/query
KANA_YAHOO_FURIGANA_API_URL=https://jlp.yahooapis.jp/FuriganaService/V2/furigana
```

補足:

- 現行アプリは `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を実行時には使わない
- DB 接続は `app/lib/server-postgres.ts` の `PG*` で行う
- つまり、接続先は Supabase でも、アプリ側の接続方式は `supabase-js` ではなく PostgreSQL 直接接続
- Supabase へつなぐときは `PGSSLMODE=require` を使う
- `SELF_SIGNED_CERT_IN_CHAIN` が出る場合は `PGSSLREJECTUNAUTHORIZED=false` にして再デプロイする

## Supabase 値の対応表

Supabase ダッシュボードの `Connect` で表示される接続情報から、Vercel へ次のように入れる。

| Vercel env | Supabase で見る場所 | 例 |
| --- | --- | --- |
| `PGHOST` | `Connect` の connection string / parameters の Host | `aws-0-ap-northeast-1.pooler.supabase.com` |
| `PGPORT` | `Connect` の Port | `6543` |
| `PGUSER` | `Connect` の User | `postgres.xxxxxxxx` |
| `PGDATABASE` | `Connect` の Database | `postgres` |
| `PGPASSWORD` | project 作成時に決めた DB password | `********` |
| `PGSSLMODE` | 固定 | `require` |
| `PGSSLREJECTUNAUTHORIZED` | 通常は固定 | `true` |

推奨:

- Vercel Preview では、Supabase の **Transaction pooler** を使う
- これは Supabase 公式でも serverless 向けの推奨系統

## 環境の分け方

Supabase は最低でも 2 つに分ける。

1. テストデプロイ用 Supabase Project
2. 本番用 Supabase Project

ルール:

- テストデプロイで本番 Supabase DB を使わない
- Vercel の Preview / テスト用 Environment Variables には、テスト用 Supabase 接続情報だけを入れる
- Production Environment Variables は、今回はまだ空でもよい
- 本番運用へ移るときだけ、本番用 Supabase 接続情報を別途入れる

## テストデプロイ環境の作り方

1. GitHub の対象ブランチへ反映する
2. Vercel で新規 Project を作成する
3. リポジトリを接続する
4. Framework Preset が Next.js になっていることを確認する
5. Build Command は既定値のままでよい
6. Preview Environment Variables にテスト用 `PG*` と `YAHOO_CLIENT_ID` を登録する
7. 初回デプロイを実行する
8. 発行された Preview URL を確認する

## 反映確認の運用

テスト用の確認ループは、以後この流れで回す。

1. ローカルで修正する
2. テスト用ブランチへ commit / push する
3. Vercel Preview Deploy の完了を待つ
4. Preview URL を開く
5. 修正箇所がグローバルで反映されているか確認する

補足:

- できるだけ Preview URL は毎回同じ Project 配下で管理する
- DB は常にテスト用 Supabase Project を見る
- これで「ローカルで直したものが、すぐ外から見えるか」を毎回確認できる

## 初回確認

まず Preview URL で次を確認する。

1. `/` が開く
2. 存在しない URL で 404 画像が出る
3. `/errors/unexpected` で 500 画像が出る
4. DB が正常時に著者・出版社・雑誌マスターの一覧が開く

## DB 不通テスト

余力があれば、Preview 環境で DB 不通時の見え方も確認する。

1. 一時的に `PGHOST` などを無効値へ変更して再デプロイする
2. `/masters/authors` などから `/errors/db-unavailable` に遷移することを確認する
3. 確認後は正しい値へ戻して再デプロイする

## 次の段階

このテストループが安定したら、次に本番段階へ進む。

そのときに初めて、次を考える。

1. Production 用 Vercel Environment Variables を入れる
2. 本番用 Supabase Project を接続する
3. 本番 URL で公開確認を行う

## Related Docs

- [deployment_readiness.md](/Volumes/DATA4%208T/myprogram/Codex/mymag/docs/deployment_readiness.md)
- [pre_release_smoke_test_checklist.md](/Volumes/DATA4%208T/myprogram/Codex/mymag/docs/pre_release_smoke_test_checklist.md)
- [database_design.md](/Volumes/DATA4%208T/myprogram/Codex/mymag/docs/database_design.md)
