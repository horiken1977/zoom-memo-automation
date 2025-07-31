---
layout: default
title: Zoom Memo Automation
---

# Zoom Memo Automation

自動化されたZoom会議記録処理システム

## 🚀 メインアプリケーション

**完全なドキュメントとダッシュボードは以下のVercelサイトでご確認ください：**

### [**Zoom Memo Automation - メインサイト**](https://zoom-memo-automation.vercel.app/)

## 概要

このシステムは、Zoomクラウド録画を自動的に監視し、新しい録画を検出すると以下の処理を実行します：

1. **録画の自動検出** - Zoom APIを使用して新しい録画を定期的にチェック
2. **文字起こし** - Google AI (Gemini)を使用して音声を文字起こし
3. **要約生成** - 会議の要点、決定事項、アクションアイテムを自動抽出
4. **Slack通知** - 要約を指定チャンネルに自動送信

## ドキュメント（Vercelサイト）

- [ダッシュボード](https://zoom-memo-automation.vercel.app/) - システム概要とリアルタイム状態
- [機能設計書](https://zoom-memo-automation.vercel.app/functional-design.html) - 詳細な機能仕様
- [環境設計書](https://zoom-memo-automation.vercel.app/environment-design.html) - システム構成と設定
- [テスト仕様書](https://zoom-memo-automation.vercel.app/test-specification.html) - テスト計画と手順

## セットアップ

1. 必要な環境変数を設定（GitHub SecretsまたはVercel環境変数）
2. `npm install`で依存関係をインストール
3. `npm run setup`でセットアップウィザードを実行
4. `npm start`でシステムを起動

詳細な手順は[環境設計書](https://zoom-memo-automation.vercel.app/environment-design.html)を参照してください。

## リポジトリ情報

- **GitHub**: [horiken1977/zoom-memo-automation](https://github.com/horiken1977/zoom-memo-automation)
- **Vercel**: [zoom-memo-automation.vercel.app](https://zoom-memo-automation.vercel.app/)
- **GitHub Pages**: このページ（最小限の情報）

---

🤖 **Powered by Claude Code** | 📝 **Auto-generated Documentation** | 🚀 **GRTX Internal Tools**