#!/usr/bin/env node

// Live API test runner for production environment
async function runLiveAPITests() {
  console.log('🚀 Zoom Memo Automation - Live API Tests');
  console.log('==========================================\n');

  const baseUrl = 'https://zoom-memo-automation.vercel.app';
  const results = {
    timestamp: new Date().toISOString(),
    environment: 'production',
    base_url: baseUrl,
    tests: {}
  };

  try {
    // Wait for deployment to complete
    console.log('⏳ Waiting for Vercel deployment to complete...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

    // Test 1: Health Check (API Connections)
    console.log('1️⃣ Running comprehensive health check...');
    try {
      const healthResponse = await fetch(`${baseUrl}/api/health-check`);
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        results.tests.health_check = healthData;
        
        console.log(`✅ Health check completed with status: ${healthData.summary.overall_status}`);
        console.log(`   Success rate: ${healthData.summary.success_rate}`);
        console.log(`   Successful tests: ${healthData.summary.successful_tests}/${healthData.summary.total_tests}`);
        
        // Display individual test results
        Object.entries(healthData.tests).forEach(([testName, testResult]) => {
          const status = testResult.status === 'success' ? '✅' : '❌';
          console.log(`   ${status} ${testName}: ${testResult.message}`);
        });
        
      } else {
        console.log(`❌ Health check failed with status: ${healthResponse.status}`);
        const errorText = await healthResponse.text();
        results.tests.health_check = {
          status: 'error',
          status_code: healthResponse.status,
          error: errorText
        };
      }
    } catch (error) {
      console.log(`❌ Health check error: ${error.message}`);
      results.tests.health_check = {
        status: 'error',
        error: error.message
      };
    }

    console.log('\n2️⃣ Running Slack notification test...');
    try {
      const slackResponse = await fetch(`${baseUrl}/api/test-slack-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (slackResponse.ok) {
        const slackData = await slackResponse.json();
        results.tests.slack_notification = slackData;
        
        console.log(`✅ Slack notification test: ${slackData.message}`);
        if (slackData.slack_response) {
          console.log(`   Message sent to channel: ${slackData.slack_response.channel}`);
          console.log(`   Permalink: ${slackData.slack_response.permalink}`);
        }
        
      } else {
        const slackError = await slackResponse.json();
        results.tests.slack_notification = slackError;
        console.log(`❌ Slack notification test failed: ${slackError.message}`);
      }
    } catch (error) {
      console.log(`❌ Slack notification test error: ${error.message}`);
      results.tests.slack_notification = {
        status: 'error',
        error: error.message
      };
    }

    // Calculate overall test results
    const healthSuccess = results.tests.health_check?.summary?.overall_status === 'success';
    const slackSuccess = results.tests.slack_notification?.status === 'success';
    
    const totalTests = 2;
    const successfulTests = (healthSuccess ? 1 : 0) + (slackSuccess ? 1 : 0);
    
    results.summary = {
      total_tests: totalTests,
      successful_tests: successfulTests,
      failed_tests: totalTests - successfulTests,
      success_rate: `${((successfulTests / totalTests) * 100).toFixed(1)}%`,
      overall_status: successfulTests === totalTests ? 'success' : 'partial_failure'
    };

    console.log('\n📊 Live API Test Summary');
    console.log('========================');
    console.log(`Total Tests: ${results.summary.total_tests}`);
    console.log(`Successful: ${results.summary.successful_tests}`);
    console.log(`Failed: ${results.summary.failed_tests}`);
    console.log(`Success Rate: ${results.summary.success_rate}`);
    console.log(`Overall Status: ${results.summary.overall_status.toUpperCase()}\n`);

    // Save results
    const fs = require('fs');
    const path = require('path');
    const dataDir = path.join(__dirname, '../data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const resultsFile = path.join(dataDir, `live-api-test-results-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    
    console.log(`📊 Detailed results saved to: ${resultsFile}`);

    return results;

  } catch (error) {
    console.error('❌ Live API test execution failed:', error);
    results.error = error.message;
    return results;
  }
}

// Run tests if called directly
if (require.main === module) {
  runLiveAPITests()
    .then(results => {
      const success = results.summary?.overall_status === 'success';
      console.log(`\n🏁 Live API tests completed: ${success ? 'SUCCESS' : 'FAILED'}`);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = { runLiveAPITests };