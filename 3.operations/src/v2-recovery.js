#!/usr/bin/env node

/**
 * v2.0実装復旧スクリプト
 * クラッシュ後の状態復元用
 */

const fs = require('fs');
const path = require('path');

class V2Recovery {
  constructor() {
    this.checkpointDir = path.join(__dirname, '../v2.0-checkpoints');
    this.memoryFile = path.join(__dirname, '../../.serena/memories/v2.0_implementation_progress.md');
  }

  /**
   * 最新のチェックポイントを取得
   */
  getLatestCheckpoint() {
    try {
      const files = fs.readdirSync(this.checkpointDir)
        .filter(f => f.endsWith('-checkpoint.json'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(this.checkpointDir, a));
          const statB = fs.statSync(path.join(this.checkpointDir, b));
          return statB.mtime - statA.mtime;
        });

      if (files.length === 0) {
        console.log('⚠️ チェックポイントファイルが見つかりません');
        return null;
      }

      const latestFile = path.join(this.checkpointDir, files[0]);
      const checkpoint = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
      
      return {
        file: files[0],
        data: checkpoint
      };
    } catch (error) {
      console.error('❌ チェックポイント読み込みエラー:', error.message);
      return null;
    }
  }

  /**
   * 現在の進捗状況を表示
   */
  showProgress(checkpoint) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 v2.0 実装進捗状況');
    console.log('='.repeat(60));
    
    console.log(`\n🎯 現在のPhase: ${checkpoint.phase} - ${checkpoint.name}`);
    console.log(`📅 開始時刻: ${new Date(checkpoint.startTime).toLocaleString()}`);
    console.log(`🔄 最終更新: ${new Date(checkpoint.lastUpdate).toLocaleString()}`);
    
    console.log('\n✅ 完了済みステップ:');
    checkpoint.completedSteps.forEach(step => {
      console.log(`   ✓ ${step.step} (${new Date(step.timestamp).toLocaleTimeString()})`);
      if (step.files) {
        console.log(`      影響ファイル: ${step.files.length}個`);
      }
    });
    
    console.log('\n⏳ 次のステップ:');
    checkpoint.pendingSteps.forEach((step, index) => {
      const marker = index === 0 ? '→' : ' ';
      console.log(`   ${marker} ${step.step} [${step.status}]`);
    });
    
    if (checkpoint.recovery) {
      console.log('\n🔧 復旧情報:');
      console.log(`   最後のファイル: ${checkpoint.recovery.lastFile}`);
      console.log(`   最後の行: ${checkpoint.recovery.lastLine}`);
      console.log(`   最後のアクション: ${checkpoint.recovery.lastAction}`);
    }
    
    console.log('\n' + '='.repeat(60));
  }

  /**
   * 復旧用コマンド生成
   */
  generateRecoveryCommands(checkpoint) {
    const commands = [];
    
    console.log('\n🚀 復旧用コマンド:');
    console.log('-'.repeat(40));
    
    // Serenaメモリー読み込み
    commands.push('# Serenaメモリー読み込み');
    commands.push('mcp__serena__read_memory v2.0_implementation_progress');
    
    // 現在のPhaseに応じたコマンド
    if (checkpoint.phase === 'Phase1') {
      commands.push('\n# Phase1継続コマンド');
      commands.push('mcp__serena__find_symbol processRecording');
      commands.push('mcp__serena__find_referencing_symbols processRecording');
    } else if (checkpoint.phase === 'Phase2') {
      commands.push('\n# Phase2継続コマンド');
      commands.push('# TranscriptService実装確認');
      commands.push('ls 1.src/services/transcriptService.js');
    }
    
    // 最後のファイルを開く
    if (checkpoint.recovery?.lastFile) {
      commands.push(`\n# 最後の作業ファイルを開く`);
      commands.push(`Read ${checkpoint.recovery.lastFile}:${checkpoint.recovery.lastLine || 1}`);
    }
    
    commands.forEach(cmd => console.log(cmd));
    console.log('-'.repeat(40));
    
    return commands;
  }

  /**
   * チェックポイント更新
   */
  updateCheckpoint(phase, updates) {
    const checkpointFile = path.join(this.checkpointDir, `${phase.toLowerCase()}-checkpoint.json`);
    
    try {
      let checkpoint = {};
      if (fs.existsSync(checkpointFile)) {
        checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
      }
      
      // 更新をマージ
      Object.assign(checkpoint, updates, {
        lastUpdate: new Date().toISOString()
      });
      
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
      console.log(`✅ チェックポイント更新完了: ${phase}`);
      
      return checkpoint;
    } catch (error) {
      console.error('❌ チェックポイント更新エラー:', error.message);
      return null;
    }
  }

  /**
   * 全Phase状況サマリー
   */
  showAllPhases() {
    const phases = [
      { id: 'phase1', name: 'Phase1: 影響範囲調査・分析' },
      { id: 'phase2', name: 'Phase2: TranscriptService単体実装' },
      { id: 'phase3', name: 'Phase3: フォールバック機構実装' },
      { id: 'phase4', name: 'Phase4: A/Bテスト環境構築' },
      { id: 'phase5', name: 'Phase5: 段階的本番移行' }
    ];
    
    console.log('\n📋 全Phase進捗状況');
    console.log('='.repeat(60));
    
    phases.forEach(phase => {
      const checkpointFile = path.join(this.checkpointDir, `${phase.id}-checkpoint.json`);
      if (fs.existsSync(checkpointFile)) {
        const data = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
        const status = data.status === 'completed' ? '✅' : 
                      data.status === 'in_progress' ? '🟡' : '⏸️';
        console.log(`${status} ${phase.name}: ${data.status || 'not_started'}`);
      } else {
        console.log(`⏸️ ${phase.name}: 未開始`);
      }
    });
    
    console.log('='.repeat(60));
  }

  /**
   * メイン実行
   */
  run() {
    console.log('🔄 v2.0 実装復旧ツール');
    console.log('=' .repeat(60));
    
    // 最新チェックポイント取得
    const latest = this.getLatestCheckpoint();
    
    if (latest) {
      this.showProgress(latest.data);
      this.generateRecoveryCommands(latest.data);
    }
    
    // 全Phase状況表示
    this.showAllPhases();
    
    // Serenaメモリーチェック
    if (fs.existsSync(this.memoryFile)) {
      console.log('\n✅ Serenaメモリーファイル存在確認');
    } else {
      console.log('\n⚠️ Serenaメモリーファイルが見つかりません');
    }
  }
}

// CLIとして実行
if (require.main === module) {
  const recovery = new V2Recovery();
  
  const args = process.argv.slice(2);
  
  if (args[0] === 'update') {
    // チェックポイント更新モード
    const phase = args[1];
    const updateJson = args[2] ? JSON.parse(args[2]) : {};
    recovery.updateCheckpoint(phase, updateJson);
  } else {
    // 通常の復旧モード
    recovery.run();
  }
}

module.exports = V2Recovery;