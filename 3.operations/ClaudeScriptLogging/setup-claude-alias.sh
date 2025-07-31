#!/bin/bash

# Claude Code用エイリアス設定スクリプト

echo "🔧 Claude Codeエイリアス設定中..."

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# プロジェクトルートディレクトリ（2階層上）
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 実行権限付与
chmod +x "$SCRIPT_DIR/claude-record.sh"
chmod +x "$SCRIPT_DIR/save-conversation.js"

# エイリアスを追加
SHELL_RC="$HOME/.zshrc"  # macOSの場合
if [ ! -f "$SHELL_RC" ]; then
    SHELL_RC="$HOME/.bashrc"  # Linuxの場合
fi

# エイリアス定義
cat >> "$SHELL_RC" << EOF

# Claude Code対話記録エイリアス
alias claude-zoom='cd "$PROJECT_DIR" && ./3.operations/ClaudeScriptLogging/claude-record.sh'
alias save-chat='node $PROJECT_DIR/3.operations/ClaudeScriptLogging/save-conversation.js'
alias claude-monitor='cd "$PROJECT_DIR" && npm run claude-monitor'

EOF

echo "✅ エイリアス設定完了！"
echo ""
echo "📝 使用方法:"
echo "1. source $SHELL_RC  # 設定を反映"
echo "2. claude-zoom       # 対話を記録しながらClaude Codeを起動"
echo "3. save-chat \"要求\" \"実装内容\"  # 対話後に手動で記録"
echo "4. claude-monitor    # 自動更新監視を開始"