# Project Genesis

Project Genesis は、デュエル・マスターズを本気で好きだった体験から始まった、対戦カードゲーム開発プロジェクト。

ただし、目的はコピーを作ることではない。

デュエマで面白かった体験を理解し、受け継ぐべきものは受け継ぎ、Genesisとして良くできるものは進化させる。

このリポジトリは、Project Genesis の「戻る場所」として使う。チャットで出た大事な考え、ルール、判断基準は、ここに書いて残す。

## 今の段階

Genesis は、アイデアから実体へ移る段階にいる。

まずは設計思想を固める。その上で、遊べるプロトタイプに落とし込む。

## 文書一覧

- [設計原則](docs/design-principles.md)
- [やらないこと](docs/anti-philosophy.md)
- [ルール設計思想](docs/rule-principles.md)
- [ロードマップ](docs/roadmap.md)
- [ゲーム仕様 v0](docs/game-spec-v0.md)
- [カード設計原則](docs/card-design-principles.md)
- [カードプール v0](docs/cards-v0.md)
- [スターターデッキ v0](docs/starter-decks-v0.md)
- [紙プロトタイプ作成メモ](docs/print-and-play-v0.md)
- [用語辞典](docs/glossary.md)
- [意思決定ログ](docs/decision-log.md)
- [試作と改善の進め方](docs/iteration-principles.md)
- [エージェント体制](docs/agent-roles.md)
- [外部プレイテストレビュー](docs/external-playtest-reviews.md)
- [プレイテスト手順](docs/playtest-guide.md)
- [プレイテストログ](docs/playtest-log.md)

## 基本姿勢

良いものは受け継いでいい。

変えること自体が偉いわけではない。

本当に見るべきなのは、いつも一つだけ。

> それは Genesis にとって一番いい選択か。

## 次にやること

`docs/starter-decks-v0.md` をもとに、最初の紙プロトタイプを作る。

遊び方は `docs/playtest-guide.md` を使う。

遊んだ結果は `docs/playtest-log.md` に残す。

## ブラウザプロトタイプ

ローカルで確認する:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 5174
```

開く:

```text
http://127.0.0.1:5174/
```

印刷用カードシート:

```text
http://127.0.0.1:5174/app/print.html
```

## 検証

カードデータ、デッキ枚数、アプリ構文を確認する:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\validate.ps1
```
