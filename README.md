# LeetTrans

英語⇄日本語を **Leet表記でめちゃくちゃに翻訳してしまう** お遊びアプリです。  
（正確な翻訳はしません。文脈的にあり得ないのが正解）

## 使い方

- `index.html` を開くだけで動きます（ネット接続不要）
- 入力すると自動で翻訳します
- **Level 1 / 2 / 3** で段階的に壊れていきます
- 翻訳方向は **自動 / 英語→日本語 / 日本語→英語** を選べます

## GitHub Pages で公開する

このリポジトリは **静的サイト** なので、GitHub Pages でそのまま公開できます。
（URLを開くときは `.../repo/` のように末尾 `/` が付いている状態が確実です）

### 方法A: GitHub Actions（推奨）

1. GitHub のリポジトリで `Settings` → `Pages`
2. `Build and deployment` の `Source` を **GitHub Actions** にする
3. `main` に push すると自動でデプロイされます

### 方法B: ブランチから配信（簡単）

1. `Settings` → `Pages`
2. `Source` を `Deploy from a branch`
3. `Branch` を `main` / `/(root)` にする

