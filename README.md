# スマホのもしも帖（プロトタイプ）

[企画書 (docs/project_plan.md)](./docs/project_plan.md) に基づく、**柱①「初心者向け疑似体験ゲーム（サウンドノベル）」**および**柱②「三現主義ナレッジデータベース」**の GitHub Pages 対応プロトタイプです。

ビルド工程なしの HTML / CSS / Vanilla JavaScript（ES Modules）＋ CSV データファイルで構成されています。

---

## ファイル構成

```text
dejisuitb/
├── index.html              # アプリ本体
├── css/
│   └── style.css           # 高齢者・初心者向けUIスタイル
├── js/
│   ├── app.js              # 画面遷移・CSV初期ロード
│   ├── csvParser.js        # RFC4180準拠CSVパーサー
│   ├── novelEngine.js      # サウンドノベル進行・SMS違和感探索・得点化
│   └── knowledgeDb.js      # 三現主義DB（4レイヤー集計・検索・フィルタ）
├── data/
│   ├── episodes.csv        # 全15話の一覧・ステータス管理
│   ├── knowledge_db.csv    # 柱②ダミーデータ（4レイヤー・18件）
│   └── scenarios/
│       ├── 01.csv          # 第1話「届くはずのない荷物」（公開版）
│       ├── 02.csv 〜 15.csv # 第2〜15話（1話1ファイル・分担編集用ダミー）
└── docs/
    └── project_plan.md     # サービス企画書
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

1話ごとに `data/scenarios/01.csv` 〜 `data/scenarios/15.csv` の個別ファイルに分かれているため、複数人で別々の話数を並行して作成できます。

1. 担当する話数のCSV（例：`data/scenarios/02.csv`）をテキストエディタや Excel / Google スプレッドシート（UTF-8 CSV）で編集します。
   - `scene_type`:
     - `narration`（地の文）
     - `dialogue`（会話）
     - `sms`（SMS再現画面：`sms_sender` や `sms_body` 内の怪しい箇所を `[[表示文字|解説文]]` で囲むとタップできるチェックポイントになります）
     - `choice`（最大3つの選択肢：`choice1_label` / `choice1_next` / `choice1_score` 〜 `choice3_*`）
     - `result`（エンディング・行動ルール解説）
2. 完成したら、`data/episodes.csv` の該当行にある `status` 列を `dummy` から `playable` に変更します。
