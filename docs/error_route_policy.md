# Error Route Policy

## Purpose

`mymag` では、すべてのエラーを同じ見せ方にせず、原因ごとに扱いを分ける。
公開前の確認と今後の実装判断で迷わないよう、現行ルールをここに固定する。

## Current Rule

### 1. `404`

- 対象:
  - 存在しない URL
  - ルーティング仕様に合わない URL
- 挙動:
  - `notFound()` に流す
  - 404 専用画像を表示する
- 実装入口:
  - `app/[...path]/page.tsx`
  - `app/not-found.tsx`

### 2. `db-unavailable`

- 対象:
  - PostgreSQL / Supabase への接続失敗
  - DB 起動中、接続拒否、タイムアウトなど
- 挙動:
  - API は `503` と `code=db_unavailable` を返す
  - クライアントは `/errors/db-unavailable` に遷移する
  - 画面全体を DB 不通専用画像へ切り替える
- 理由:
  - これは個別画面の入力ミスではなく、アプリ全体の基盤障害だから
- 実装入口:
  - `app/lib/server-database-error.ts`
  - `app/lib/database-error.ts`
  - `app/home-client.tsx`
  - `app/components/account-menu.tsx`

### 3. `unexpected`

- 対象:
  - React / Next.js の未捕捉例外
  - 画面全体を継続表示できない UI 側の致命例外
- 挙動:
  - `/errors/unexpected` または `app/error.tsx` で 500 専用画像を表示する
- 理由:
  - 画面内メッセージでは回復不能な UI 破綻だから
- 実装入口:
  - `app/error.tsx`
  - `app/errors/unexpected/page.tsx`

### 4. 通常の `4xx / 5xx`

- 対象:
  - 入力不正
  - 対象データなし
  - 業務ルール違反
  - DB 不通ではない通常の 500
- 挙動:
  - 原則として、その画面やダイアログの中でエラーメッセージ表示に留める
  - ただちに全画面エラーへは遷移しない
- 理由:
  - 多くは個別操作の失敗であり、アプリ全体停止ではないため

## Practical Decision

新しい API や画面を追加するときは、まず次の順で判断する。

1. DB 接続障害か
2. 画面全体を継続できない未捕捉例外か
3. それ以外の個別操作エラーか

判定結果:

- `1` なら `db-unavailable`
- `2` なら `unexpected`
- `3` なら画面内エラー

## Notes

- `db-unavailable` を増やしすぎると、単なる保存失敗まで全画面遷移してしまう
- `unexpected` を安易に増やすと、業務エラーと致命障害の見分けがつかなくなる
- そのため、全画面エラーは `404` `db-unavailable` `unexpected` の 3 種に絞る
