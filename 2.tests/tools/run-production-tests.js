#!/usr/bin/env node

// Main test runner for production environment tests
const { testProductionEnvironment } = require('./production-env-test');
const { testAPIConnections } = require('./api-connection-test');

async function runAllTests() {
  console.log('🧪 Zoom Memo Automation - Production Test Suite');
  console.log('================================================\n');

  const results = {
    timestamp: new Date().toISOString(),
    environment: 'production',
    tests: {},
    summary: {}
  };

  let totalTests = 0;
  let passedTests = 0;

  try {
    // Phase 1: Environment Variables Test
    console.log('Phase 1: Environment Variables Test');
    console.log('-----------------------------------');
    totalTests++;
    
    const envTestResult = await testProductionEnvironment();
    results.tests.environment = {
      status: envTestResult ? 'passed' : 'failed',
      timestamp: new Date().toISOString()
    };
    
    if (envTestResult) {
      passedTests++;
      console.log('✅ Environment test PASSED\n');
    } else {
      console.log('❌ Environment test FAILED\n');
    }

    // Phase 2: API Connections Test
    console.log('Phase 2: API Connections Test');
    console.log('-----------------------------');
    totalTests++;
    
    const apiTestResult = await testAPIConnections();
    results.tests.api_connections = {
      status: 'info', // Info because we need actual production execution
      timestamp: new Date().toISOString(),
      details: apiTestResult
    };
    
    console.log('ℹ️  API connection tests prepared (requires production execution)\n');

    // Summary
    console.log('Test Execution Summary');
    console.log('=====================');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

    results.summary = {
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: totalTests - passedTests,
      success_rate: ((passedTests / totalTests) * 100).toFixed(1) + '%'
    };

    console.log('🎯 Next Steps for Complete Testing:');
    console.log('1. Verify Vercel environment variables are properly set');
    console.log('2. Create production test endpoints in Vercel Functions');
    console.log('3. Execute live API tests in production environment');
    console.log('4. Run Slack notification tests');
    console.log('5. Test actual Zoom recording processing (if available)\n');

    return results;

  } catch (error) {
    console.error('❌ Test suite execution failed:', error.message);
    results.error = error.message;
    return results;
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests()
    .then(results => {
      console.log('Test suite completed at:', results.timestamp);
      
      // Write results to data directory
      const fs = require('fs');
      const path = require('path');
      const dataDir = path.join(__dirname, '../data');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const resultsFile = path.join(dataDir, `test-results-${Date.now()}.json`);
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
      
      console.log(`📊 Test results saved to: ${resultsFile}`);
      
      process.exit(results.summary && results.summary.failed_tests === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };