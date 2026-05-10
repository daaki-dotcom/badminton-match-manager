# Claude.ai 引き継ぎ指示書

## あなたへのお願い

このドキュメントを読んで、以下の3種類のドキュメントを作成してください。
作成は日本語で、初学者でも理解できる丁寧な説明を心がけてください。

---

## プロジェクト概要

**アプリ名：** バドミントン試合管理ツール  
**用途：** 社内バドミントン部の練習当日における出欠確認・試合管理・結果集計・懇親会参加確認を一元管理するWebアプリ  
**利用者：** 社内バドミントン部員（正規部員・ゲスト）およびオーナー（管理専用）

---

## 技術スタック

| 区分 | 技術 |
|------|------|
| フロントエンド | React 18 + TypeScript + Vite |
| データベース | Firebase Realtime Database |
| 認証 | Firebase Realtime DB + SHA-256ハッシュ（自前実装） |
| ホスティング | GitHub Pages |
| CI/CD | GitHub Actions（main push で自動デプロイ） |

---

## リポジトリ情報

- **GitHub：** https://github.com/daaki-dotcom/badminton-match-manager
- **公開URL：** https://daaki-dotcom.github.io/badminton-match-manager/
- **mainブランチ：** ソースコード
- **gh-pagesブランチ：** ビルド済み公開ファイル（GitHub Actionsが自動生成）

---

## ディレクトリ構成

```
badminton-app/
├── src/
│   ├── App.tsx                    ← ルートコンポーネント・全ハンドラ定義
│   ├── auth.ts                    ← SHA-256認証・localStorage管理
│   ├── firebase.ts                ← Firebase初期化
│   ├── algorithm.ts               ← 試合生成アルゴリズム
│   ├── types.ts                   ← 全型定義
│   ├── main.tsx                   ← エントリポイント
│   ├── components/
│   │   ├── Home.tsx               ← ホームタブ（初期画面）
│   │   ├── Header.tsx             ← ヘッダー・タブナビ・ログアウト・設定
│   │   ├── Members.tsx            ← メンバータブ
│   │   ├── Matches.tsx            ← 組み合わせタブ
│   │   ├── Results.tsx            ← 結果・順位タブ
│   │   ├── Party.tsx              ← 懇親会タブ
│   │   ├── Admin.tsx              ← 管理タブ（admin/owner専用）
│   │   ├── Login.tsx              ← ログイン画面・初回セットアップ
│   │   ├── PasswordChange.tsx     ← 初回パスワード変更強制
│   │   └── SettingsModal.tsx      ← 名前変更・パスワード変更モーダル
│   ├── hooks/
│   │   └── useFirebase.ts         ← Firebase リアルタイム同期
│   └── styles/
│       └── index.css
├── docs/                          ← 設計書（本ファイル含む）
├── .github/
│   └── workflows/
│       └── deploy.yml             ← 自動デプロイ設定
├── .gitignore
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## ロール（権限）設計

| role | 対象 | できること |
|------|------|-----------|
| owner | 管理専用ユーザー（1人） | 全操作 + オーナー譲渡（試合・出欠対象外） |
| admin | 限られた正規部員（最大4人） | 全操作（試合・出欠対象） |
| member | 正規部員 | 自分の出欠・スコア入力・懇親会回答・PW変更 |
| guest | ログインなし | 閲覧・懇親会回答のみ |

### ownerの特殊性
- `managementOnly: true` フラグを持つ
- 出欠一覧・試合プール・メンバータブから除外される
- ログイン後のホーム画面で出欠セクションが非表示

---

## Firebase データ構造

```
badminton/
├── activityDate: "YYYY-MM-DD"      ← 活動日
├── courts: 2                        ← コート数
├── attendance/                      ← 出欠（全員・活動日+7日でリセット）
│   └── {名前}: "yes"|"no"|"undecided"|""
├── memberLevels/                    ← ゲストのセッション別レベル
│   └── {名前}: "exp"|"nov"
├── matches/                         ← 試合データ
│   └── {index}/
│       ├── p1, p2: string
│       ├── s1, s2: string
│       ├── status: "wait"|"playing"|"done"
│       └── court: number
├── party/                           ← 懇親会参加
│   └── {名前}: "yes"|"no"|""
├── paymentClub/                     ← 部活参加費
│   └── {名前}: boolean
├── paymentParty/                    ← 懇親会費
│   └── {名前}: boolean
└── users/                           ← 正規部員マスタ
    └── {ランダムID}/
        ├── passwordHash: string     ← SHA-256ハッシュ
        ├── role: "owner"|"admin"|"member"
        ├── name: string
        ├── level: "exp"|"nov"       ← DB永続レベル
        ├── isFirstLogin: boolean
        └── managementOnly: boolean  ← 管理専用フラグ
```

---

## 認証フロー

```
1. 起動 → localStorage のセッション確認（有効期限1日）
2. セッションなし → ログイン画面表示
   - users ノードが空 → 初回セットアップ画面（admin作成）
   - users あり → ID + PW 入力（SHA-256照合）
   - ゲスト入場ボタン → 閲覧・懇親会のみ
3. isFirstLogin: true → パスワード変更強制
4. ログイン成功 → ホーム画面（🏠タブ）
```

---

## 自動デプロイの仕組み

```
① コードを変更・編集（ローカルPC）
② git add . && git commit -m "メモ" && git push
③ GitHub の main ブランチに届く
④ GitHub Actions が自動起動（.github/workflows/deploy.yml）
   - npm ci（依存パッケージ取得）
   - npm run build（Viteでビルド）
   - gh-pages ブランチへ push
⑤ GitHub Pages が自動的に公開
⑥ 2〜3分後にURLへ反映
```

---

## 作成をお願いするドキュメント

### 【ドキュメント①】Git運用手順書

以下の内容を含む、初学者向けの手順書を作成してください。

**対象読者：** git をほとんど使ったことがない開発者  
**形式：** Markdown（見出し・コードブロック・表を活用）

**含める内容：**

1. **基本概念の説明**
   - git とは何か（保存履歴管理ツールとしての説明）
   - ローカル・GitHub・GitHub Pages の関係図
   - ブランチとは何か

2. **日常の開発フロー（ブランチ戦略）**
   - main ブランチ = 本番（直接触らない）
   - feature/fix ブランチで作業する理由
   - ブランチ命名規則（例：`feat/add-score-display`、`fix/login-bug`）

3. **コミットの手順**
   - `git checkout -b ブランチ名`（作業ブランチ作成）
   - `git add .`（変更をステージング）
   - `git commit -m "メッセージ"`（コミット）
   - コミットメッセージの書き方（feat/fix/docs/style/refactor の使い分け）

4. **プッシュの手順**
   - `git push origin ブランチ名`
   - 初回 `-u` フラグの説明

5. **プルリクエスト（PR）の作成手順**
   - GitHub画面でのPR作成手順（スクリーンショット位置の説明）
   - PRのタイトル・説明文の書き方
   - レビューとマージの流れ

6. **マージ後の対応**
   - `git checkout main && git pull`（ローカルを最新に）
   - 作業ブランチの削除

7. **ロールバック（過去に戻す）方法**
   - PRの「Revert」ボタンを使う方法（推奨）
   - `git revert` コマンドを使う方法
   - どんなときに使うか

8. **よくあるエラーと対処法**
   - `rejected (fetch first)` → pull してから push
   - コンフリクト（競合）が起きたとき
   - 間違えてmainに直接コミットしてしまったとき

---

### 【ドキュメント②】設計書一式（更新版）

以下の設計書を、このプロジェクトの実装内容に合わせて**更新・作成**してください。  
現在 `docs/` フォルダに01〜11の設計書が存在しますが、一部が実装と乖離しています。

更新が必要な主な点：
- 認証方式：Firebase Authentication → SHA-256 + Realtime DB 自前実装に変更
- 権限設計：4段階 → owner/admin/member/guest の3+1ロール
- タブ構成：出欠タブを削除、ホームタブを追加、管理タブを追加
- データ構造：paymentClub/paymentParty/managementOnly/level の追加

更新する設計書：
- `01_システム構成図.md`
- `02_機能一覧.md`
- `03_画面遷移図.md`
- `04_画面設計書.md`
- `05_ER図.md`
- `06_テーブル定義書.md`
- `07_クラス図.md`
- `08_API仕様書.md`
- `09_詳細設計書.md`
- `10_コーディング規約.md`
- `11_運用マニュアル.md`

---

### 【ドキュメント③】開発・運用ガイド（新規作成）

ファイル名：`12_開発・運用ガイド.md`

**含める内容：**

1. **ローカル開発環境のセットアップ**
   - 必要なツール（Node.js、git、VSCode推奨）
   - リポジトリのクローン手順
   - `npm install` と `npm run dev` の手順
   - `http://localhost:5173/badminton-match-manager/` でのアクセス確認

2. **デプロイ手順**
   - 通常更新：`git add . && git commit -m "" && git push`
   - GitHub Actionsの確認方法
   - デプロイ完了の確認方法

3. **Firebaseの管理**
   - Firebase コンソールへのアクセス方法
   - Realtime Databaseのデータ確認方法
   - セキュリティルールの説明（現状と将来の推奨設定）

4. **アカウント管理**
   - 初回セットアップ（adminアカウント作成）手順
   - 部員の追加方法（管理タブからID発行）
   - パスワードの初期化方法
   - ownerの譲渡方法

5. **トラブルシューティング**
   - GitHub Actions が失敗したとき
   - Firebase に接続できないとき
   - ログインできないとき
   - データがおかしくなったとき

6. **定期メンテナンス**
   - 活動日の設定
   - データリセットのタイミング
   - バックアップの考え方

---

## 作成時の注意事項

- 対象読者は**IT初学者**です。専門用語には必ず補足説明を加えてください
- コマンドはコードブロック（```）で示してください
- 図はアスキーアートまたはMermaid記法で表現してください
- 各ドキュメントの先頭にバージョン・作成日・対象を明記してください
- コメントや説明文は日本語、コード・コマンドは英語で記述してください
