#!/bin/bash

# PT001v2テスト実行スクリプト
# 修正版zoom-memo-automationの動作確認用

echo "🚀 PT001: 本番環境スルーテスト開始"
echo "=================================="
echo "テスト対象: 本番環境録画監視（録画削除なし）"
echo "URL: https://zoom-memo-automation.vercel.app/api/test-pt001-normal"
echo ""

# Vercelデプロイ完了待機
echo "⏰ Vercelデプロイ完了待機中..."
sleep 15

# テスト実行開始時刻
START_TIME=$(date +%s)
echo "📅 テスト開始時刻: $(date '+%Y-%m-%d %H:%M:%S JST')"
echo ""

# PT001テスト実行（タイムアウト5分30秒）
echo "🎯 PT001テスト実行中..."
echo "⚠️  注意: Vercelタイムアウト制限（300秒）により途中で終了する可能性があります"
echo ""

curl -w "\n実行時間: %{time_total}秒\n" \
     --max-time 330 \
     --connect-timeout 30 \
     -v \
     "https://zoom-memo-automation.vercel.app/api/test-pt001-normal" \
     2>&1 | tee pt001v2_test_result_$(date +%Y%m%d_%H%M%S).log

# 実行結果の確認
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=================================="
echo "📊 テスト完了サマリー"
echo "=================================="
echo "📅 終了時刻: $(date '+%Y-%m-%d %H:%M:%S JST')"
echo "⏱️  総実行時間: ${DURATION}秒"

if [ $? -eq 0 ]; then
    echo "✅ HTTPリクエスト成功"
else
    echo "❌ HTTPリクエスト失敗（タイムアウトまたはエラー）"
fi

echo ""
echo "🔍 確認ポイント:"
echo "  1. 音声圧縮率が0%以外になっているか"
echo "  2. エラー発生時刻がJST表示になっているか"
echo "  3. Vercelタイムアウト時にE_SYSTEM_VERCEL_LIMITが出力されているか"
echo "  4. エラータイプとエラーコードが整合しているか"
echo ""
echo "📄 ログファイル: pt001v2_test_result_$(date +%Y%m%d_%H%M%S).log"
echo "🔗 Vercelログ確認: https://vercel.com/horiken1977/zoom-memo-automation/functions"