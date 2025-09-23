#!/usr/bin/env node

/**
 * 要件確認プロトコル自動実行スクリプト
 * Claude Codeの実装前後で必須実行される要件適合性チェック
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RequirementVerificationProtocol {
  constructor() {
    this.projectRoot = process.cwd();
    this.errors = [];
    this.warnings = [];
    this.checkResults = [];
  }

  /**
   * 【Phase 1】実装前チェック - ユーザー要求の理解確認
   */
  preImplementationCheck(userRequirement, implementationPlan) {
    console.log('🔍 Phase 1: 実装前要件確認チェック開始');
    
    // 1.1 ユーザー要求の逐語的引用確認
    if (!userRequirement || userRequirement.length < 10) {
      this.errors.push('❌ ユーザー要求が明確に引用されていません');
      return false;
    }
    
    // 1.2 実装方針の明文化確認
    if (!implementationPlan || !implementationPlan.method || !implementationPlan.steps) {
      this.errors.push('❌ 実装方針が明文化されていません (method, stepsが必要)');
      return false;
    }
    
    // 1.3 曖昧性の検出
    const ambiguousTerms = ['など', 'といった', '的な', '系の', 'みたいな'];
    const hasAmbiguity = ambiguousTerms.some(term => 
      userRequirement.includes(term) || 
      JSON.stringify(implementationPlan).includes(term)
    );
    
    if (hasAmbiguity) {
      this.warnings.push('⚠️ 曖昧な表現が検出されました。ユーザーに確認が必要です');
    }
    
    this.checkResults.push({
      phase: 'pre-implementation',
      passed: this.errors.length === 0,
      userRequirement,
      implementationPlan,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Phase 1: 実装前チェック完了');
    return this.errors.length === 0;
  }

  /**
   * 【Phase 2】実装後チェック - コードレベルでの要件適合性確認
   */
  postImplementationCheck(modifiedFiles, expectedBehavior) {
    console.log('🔍 Phase 2: 実装後要件確認チェック開始');
    
    // 2.1 修正ファイルの存在確認
    const missingFiles = modifiedFiles.filter(file => {
      const fullPath = path.join(this.projectRoot, file);
      return !fs.existsSync(fullPath);
    });
    
    if (missingFiles.length > 0) {
      this.errors.push(`❌ 修正対象ファイルが見つかりません: ${missingFiles.join(', ')}`);
      return false;
    }
    
    // 2.2 期待される動作の実装確認
    for (const behavior of expectedBehavior) {
      const checkResult = this.verifyBehaviorImplementation(behavior, modifiedFiles);
      if (!checkResult.passed) {
        this.errors.push(`❌ 期待動作が実装されていません: ${behavior.description}`);
        this.errors.push(`   詳細: ${checkResult.details}`);
      }
    }
    
    // 2.3 破壊的変更の検出
    this.detectBreakingChanges(modifiedFiles);
    
    this.checkResults.push({
      phase: 'post-implementation',
      passed: this.errors.length === 0,
      modifiedFiles,
      expectedBehavior,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Phase 2: 実装後チェック完了');
    return this.errors.length === 0;
  }

  /**
   * 期待動作の実装確認
   */
  verifyBehaviorImplementation(behavior, modifiedFiles) {
    const { pattern, shouldExist, shouldNotExist, file } = behavior;
    
    try {
      const targetFile = file ? path.join(this.projectRoot, file) : null;
      
      if (targetFile && fs.existsSync(targetFile)) {
        const content = fs.readFileSync(targetFile, 'utf8');
        
        // パターンの存在確認
        if (shouldExist) {
          const exists = shouldExist.every(p => {
            const regex = new RegExp(p);
            return regex.test(content);
          });
          
          if (!exists) {
            return {
              passed: false,
              details: `必要なパターンが見つかりません: ${shouldExist.join(', ')}`
            };
          }
        }
        
        // パターンの非存在確認
        if (shouldNotExist) {
          const exists = shouldNotExist.some(p => {
            const regex = new RegExp(p);
            return regex.test(content);
          });
          
          if (exists) {
            return {
              passed: false,
              details: `削除されるべきパターンが残っています: ${shouldNotExist.join(', ')}`
            };
          }
        }
      }
      
      return { passed: true, details: '確認完了' };
      
    } catch (error) {
      return {
        passed: false,
        details: `確認エラー: ${error.message}`
      };
    }
  }

  /**
   * 破壊的変更の検出
   */
  detectBreakingChanges(modifiedFiles) {
    try {
      // Gitを使って変更差分を確認
      const diffOutput = execSync('git diff HEAD~1 --name-only', { encoding: 'utf8' });
      const changedFiles = diffOutput.trim().split('\n').filter(Boolean);
      
      // 重要ファイルの変更確認
      const criticalFiles = [
        '1.src/services/aiService.js',
        '1.src/services/audioSummaryService.js',
        '1.src/services/zoomRecordingService.js'
      ];
      
      const criticalChanges = changedFiles.filter(file => 
        criticalFiles.includes(file)
      );
      
      if (criticalChanges.length > 0) {
        this.warnings.push(`⚠️ 重要ファイルが変更されました: ${criticalChanges.join(', ')}`);
        this.warnings.push('   既存機能への影響を確認してください');
      }
      
    } catch (error) {
      this.warnings.push(`⚠️ Git差分確認でエラー: ${error.message}`);
    }
  }

  /**
   * 結果レポートの生成
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      passed: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      checkResults: this.checkResults,
      summary: {
        totalChecks: this.checkResults.length,
        passedChecks: this.checkResults.filter(r => r.passed).length,
        errorCount: this.errors.length,
        warningCount: this.warnings.length
      }
    };
    
    // レポートファイルに保存
    const reportPath = path.join(this.projectRoot, '3.operations', 'verification-reports', 
      `verification-${Date.now()}.json`);
    
    // ディレクトリ作成
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // コンソール出力
    console.log('\n📋 要件確認プロトコル実行結果');
    console.log('='.repeat(50));
    console.log(`✅ 合格: ${report.summary.passedChecks}/${report.summary.totalChecks}`);
    console.log(`❌ エラー: ${report.summary.errorCount}`);
    console.log(`⚠️ 警告: ${report.summary.warningCount}`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ エラー詳細:');
      this.errors.forEach(error => console.log(`  ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️ 警告詳細:');
      this.warnings.forEach(warning => console.log(`  ${warning}`));
    }
    
    console.log(`\n📄 詳細レポート: ${reportPath}`);
    
    return report;
  }

  /**
   * 強制停止判定
   */
  shouldHaltExecution() {
    return this.errors.length > 0;
  }
}

// CLI実行時の処理
if (require.main === module) {
  const verifier = new RequirementVerificationProtocol();
  
  // コマンドライン引数から設定を読み込み
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'pre-check') {
    // 実装前チェック
    const userRequirement = args[1] || process.env.USER_REQUIREMENT;
    const implementationPlan = JSON.parse(args[2] || process.env.IMPLEMENTATION_PLAN || '{}');
    
    const passed = verifier.preImplementationCheck(userRequirement, implementationPlan);
    const report = verifier.generateReport();
    
    process.exit(passed ? 0 : 1);
    
  } else if (command === 'post-check') {
    // 実装後チェック
    const modifiedFiles = JSON.parse(args[1] || '[]');
    const expectedBehavior = JSON.parse(args[2] || '[]');
    
    const passed = verifier.postImplementationCheck(modifiedFiles, expectedBehavior);
    const report = verifier.generateReport();
    
    process.exit(passed ? 0 : 1);
    
  } else {
    console.error('使用方法:');
    console.error('  node verify-requirements.js pre-check "ユーザー要求" \'{"method":"実装方法","steps":["手順1"]}\'');
    console.error('  node verify-requirements.js post-check \'["file1.js"]\' \'[{"description":"動作","shouldExist":["pattern"]}]\'');
    process.exit(1);
  }
}

module.exports = RequirementVerificationProtocol;