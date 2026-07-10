# Deployment Readiness

最終更新: 2026-07-10

## Current Result

ローカル実装の棚卸しとしては、デプロイ前の最低限確認を次の状態まで進めた。

- エラーページ画像
  - `imgs/404.png`
  - `imgs/500.png`
  - `imgs/nodb.png`
  - いずれも `app/components/error-display.tsx` から import して表示する
- ログイン背景
  - `public/login-background.png`
  - CSS から `/login-background.png` で参照する
- アプリの DB 接続方式
  - 現行アプリは `app/lib/server-postgres.ts` で PostgreSQL に直接接続する
  - 接続先 DB は Supabase Postgres を想定する
  - 実際に必要な環境変数は `PGHOST` `PGPORT` `PGUSER` `PGDATABASE` `PGPASSWORD` `PGSSLMODE`
- かな補完
  - `YAHOO_CLIENT_ID` が必要
  - `KANA_KURONEKO_API_URL` と `KANA_YAHOO_FURIGANA_API_URL` は必要に応じて上書き可能
- 環境変数テンプレート
  - `.env.example` を現行実装に合わせて更新済み

## Current Target

今回の目標は本番公開ではなく、次のテストループを作ること。

1. ローカルで修正する
2. GitHub へ反映する
3. Vercel Preview へ自動デプロイする
4. テスト用 Supabase DB につないだ状態で、外部URLから確認する

## Before First Deploy

初回デプロイ前に、最低限次の作業だけは必要。

1. テスト用 Supabase Postgres 接続情報を決めて、Vercel Preview へ登録する
2. `YAHOO_CLIENT_ID` を Preview 環境へ登録する
3. デプロイ先から Supabase Postgres へ TCP 接続できることを確認する
4. Preview URL で次の 4 画面を実機確認する
   - `/`
   - 存在しない URL の 404
   - `/errors/db-unavailable`
   - `/errors/unexpected`

## Notes

- 現時点では、ローカル確認とテンプレート整備までは完了している
- テストデプロイでも、本番とは別の Supabase Project を使う前提にする
- まずは Preview 環境だけ作ればよい
- 本番値の投入は、今回の目的にはまだ含めない

## Related Docs

- [deploy_runbook.md](/Volumes/DATA4%208T/myprogram/Codex/mymag/docs/deploy_runbook.md)
- [pre_release_smoke_test_checklist.md](/Volumes/DATA4%208T/myprogram/Codex/mymag/docs/pre_release_smoke_test_checklist.md)
