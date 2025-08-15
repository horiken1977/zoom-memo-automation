#!/bin/bash

# Claude Code セッション自動保存スクリプト
# VSCodeクラッシュ時の復元用

# 設定
PROJECT_DIR="/Users/aa479881/Library/CloudStorage/GoogleDrive-horie.kenichi@grtx.jp/共有ドライブ/103_全社共有用/社内DX/zoom-memo-automation/zoom-memo-automation"
SAVE_DIR="${PROJECT_DIR}/3.operations/claude_sessions"
DATE=$(date +"%Y%m%d_%H%M%S")
SESSION_FILE="${SAVE_DIR}/session_${DATE}.md"

# セッション保存ディレクトリ作成
mkdir -p "${SAVE_DIR}"

# セッション情報を保存
cat > "${SESSION_FILE}" << EOF
# Claude Code セッション記録
日時: $(date +"%Y-%m-%d %H:%M:%S")

## 現在の作業状況

### Git状態
\`\`\`bash
$(cd "${PROJECT_DIR}" && git status --short)
\`\`\`

### 最近のコミット
\`\`\`bash
$(cd "${PROJECT_DIR}" && git log --oneline -5)
\`\`\`

### 変更ファイル
\`\`\`bash
$(cd "${PROJECT_DIR}" && git diff --name-only)
\`\`\`

### 現在のブランチ
\`\`\`bash
$(cd "${PROJECT_DIR}" && git branch --show-current)
\`\`\`

## プロジェクト状況メモ
<!-- ここに現在の作業内容を記載 -->

## 次の作業
<!-- 次に行うべき作業を記載 -->

---
自動保存: $(date)
EOF

echo "✅ セッション保存完了: ${SESSION_FILE}"

# 最新セッションへのシンボリックリンク作成
ln -sf "${SESSION_FILE}" "${SAVE_DIR}/latest_session.md"

# 古いセッションファイルを削除（7日以上前）
find "${SAVE_DIR}" -name "session_*.md" -mtime +7 -delete

echo "📁 保存先: ${SAVE_DIR}"
echo "🔗 最新セッション: ${SAVE_DIR}/latest_session.md"