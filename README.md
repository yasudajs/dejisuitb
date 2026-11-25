# スマホのもしも帖（プロトタイプ）

[企画書 (docs/project_plan.md)](./docs/project_plan.md) に基づく、**柱①「初心者向け疑似体験ゲーム（サウンドノベル）」**および**柱②「三現主義ナレッジデータベース」**の GitHub Pages 対応プロトタイプです。

ビルド工程なしの HTML / CSS / Vanilla JavaScript（ES Modules）＋ CSV データファイルで構成されています。

---

## ファイル構成

```text
dejisuitb/
├── index.html                    # アプリ本体（1ページ目：タイトル画面 / 2ページ目以降：メニュー・各機能画面）
├── images/
│   └── title-cover.jpg           # 1ページ目：タイトルカバー画像
├── css/
│   └── style.css                 # 高齢者・初心者向けUIスタイル
├── js/
│   ├── app.js                    # 画面遷移・CSV初期ロード
│   ├── csvParser.js              # RFC4180準拠CSVパーサー
│   ├── novelEngine.js            # サウンドノベル進行・画像表示・SMS違和感探索・得点化
│   └── knowledgeDb.js            # 三現主義DB（4レイヤー集計・検索・フィルタ）
├── data/
│   ├── episodes.csv              # 全15話の一覧・ステータス・scenario.csv参照先管理
│   ├── knowledge_db.csv          # 柱②ダミーデータ（4レイヤー・18件）
│   └── scenarios/
│       ├── 01/                   # 第1話「届くはずのない荷物」一式（公開版）
│       │   ├── scenario.csv      # 第1話シナリオ
│       │   └── *.png             # 第1話の場面イラスト
│       └── 02/ 〜 15/            # 第2〜15話（1話1フォルダ・分担編集用ダミー）
│           └── scenario.csv      # 各話のテンプレートシナリオ
└── docs/
    └── project_plan.md           # サービス企画書
```

---

## ローカルでの動作確認方法

ブラウザのセキュリティ制限（`fetch()` が `file://` では動かないため）を避けるため、ローカルHTTPサーバー経由で開いてください。

```bash
# Python 3 がある場合
python -m http.server 8000
```

起動後、ブラウザで `http://localhost:8000/` を開きます。

---

## GitHub Pages での公開手順

1. リポジトリを GitHub へ push します。
2. GitHub リポジトリの **Settings** → **Pages** を開きます。
3. **Build and deployment** の Source で **Deploy from a branch** を選び、Branch を **`main`** / フォルダを **`/ (root)`** に設定して **Save** を押します。
4. 数分後に発行される URL（`https://<ユーザー名>.github.io/dejisuitb/`）からそのまま利用できます。

---

## 第2話以降のシナリオ編集・追加方法（分担作業ガイド）

1話ごとに `data/scenarios/01/` 〜 `data/scenarios/15/` の連番フォルダに分かれており、1つのストーリーに関するシナリオCSVとイラスト画像を1つのフォルダでまとめて管理できます。複数人で別々の話数を並行して作成・分担できます。

1. 担当する話数のフォルダ内の `scenario.csv`（例：`data/scenarios/02/scenario.csv`）をテキストエディタや Excel / Google スプレッドシート（UTF-8 CSV）で編集します。
   - `scene_type`:
     - `narration`（地の文）
     - `dialogue`（会話）
     - `sms`（SMS再現画面：`sms_sender` や `sms_body` 内の怪しい箇所を `[[表示文字|解説文]]` で囲むとタップできるチェックポイントになります）
     - `choice`（最大3つの選択肢：`choice1_label` / `choice1_next` / `choice1_score` 〜 `choice3_*`）
     - `result`（エンディング・行動ルール解説）
   - `image`:
     - 同じフォルダ（例：`data/scenarios/02/`）に置いた画像ファイル名（例：`scene_01.png`）を指定すると、場面のイラストが表示されます。不要な場面は空欄にします。
2. 完成したら、`data/episodes.csv` の該当行にある `status` 列を `dummy` から `playable` に変更します。
