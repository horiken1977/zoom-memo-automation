#!/bin/bash

# 簡易テストスクリプト（短縮版）

echo "⚡ PT001v2 簡易テスト"
echo "===================="

curl --max-time 60 "https://zoom-memo-automation.vercel.app/api/production-throughput-test-v2?test=PT001v2"