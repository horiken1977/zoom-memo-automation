#!/bin/bash

# Claude Code対話記録スクリプト
# 使用方法: ./claude-record.sh

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# プロジェクトルートディレクトリ（2階層上）
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 設定
LOG_DIR="$PROJECT_DIR/0.docs/conversations"
CLAUDE_MD="$PROJECT_DIR/0.docs/claude.md"

# ディレクトリ作成
mkdir -p "$LOG_DIR"

# 現在の日時
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/conversation_$TIMESTAMP.log"

echo "🚀 Claude Code起動中..."
echo "📝 対話記録: $LOG_FILE"
echo "📍 プロジェクト: zoom-memo-automation"
echo ""

# ヘッダー情報を記録
{
    echo "=================================="
    echo "Claude Code 対話記録"
    echo "開始時刻: $(date '+%Y年%m月%d日 %H:%M:%S')"
    echo "プロジェクト: Zoom Memo Automation"
    echo "作業ディレクトリ: $PROJECT_DIR"
    echo "=================================="
    echo ""
} > "$LOG_FILE"

# Claude Codeを起動し、出力を記録
claude-code "$@" 2>&1 | tee -a "$LOG_FILE"

# 終了時の処理
EXIT_CODE=${PIPESTATUS[0]}
{
    echo ""
    echo "=================================="
    echo "終了時刻: $(date '+%Y年%m月%d日 %H:%M:%S')"
    echo "終了コード: $EXIT_CODE"
    echo "=================================="
} >> "$LOG_FILE"

# claude.mdに要約を追記
if [ -s "$LOG_FILE" ]; then
    echo "" >> "$CLAUDE_MD"
    echo "### $(date '+%Y/%m/%d %H:%M') - 対話記録" >> "$CLAUDE_MD"
    echo "" >> "$CLAUDE_MD"
    echo "**ログファイル:** conversations/conversation_$TIMESTAMP.log" >> "$CLAUDE_MD"
    echo "" >> "$CLAUDE_MD"
    echo "対話の詳細は上記ログファイルを参照してください。" >> "$CLAUDE_MD"
    echo "" >> "$CLAUDE_MD"
fi

echo ""
echo "✅ 対話記録保存完了: $LOG_FILE"
echo "📋 claude.mdに記録を追加しました"

exit $EXIT_CODE