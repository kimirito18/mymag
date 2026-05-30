# mymag

雑誌・単行本・著者・出版社を管理する、クローズド運用の総合書籍データベースシステムです。

現在は仕様設計とプロトタイプ準備段階です。実装方針とテーブル設計は以下にまとめています。

- [Database Design](docs/database_design.md)

## Repository Policy

元データと生成済みCSVはサイズが大きいため、Git管理から除外しています。

- `metadata/`
- `converted/`
- `master_data/*.csv`

必要な場合はローカル環境で保持し、アプリ実装後に Supabase へ移行します。
