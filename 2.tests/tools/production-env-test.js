// Production environment test for environment variables
const https = require('https');

async function testProductionEnvironment() {
  console.log('🧪 Testing Production Environment Variables...\n');

  try {
    // Test Vercel production environment via health check
    const testUrl = 'https://zoom-memo-automation.vercel.app/';
    console.log(`Testing production environment at: ${testUrl}`);
    
    // For now, we'll test by checking if the site is accessible
    const response = await fetch(testUrl);
    
    if (response.ok) {
      console.log('✅ Production environment is accessible');
      console.log(`   Status: ${response.status}`);
      console.log(`   Environment: Production (Vercel)`);
      console.log(`   Timestamp: ${new Date().toISOString()}\n`);
      
      console.log('📋 Next Steps:');
      console.log('   1. Access Vercel dashboard to verify environment variables');
      console.log('   2. Run API connection tests');
      console.log('   3. Test Slack notifications');
      
      return true;
    } else {
      console.error('❌ Failed to access production environment');
      return false;
    }
  } catch (error) {
    console.error('❌ Environment test error:', error.message);
    return false;
  }
}

// Run test if called directly
if (require.main === module) {
  testProductionEnvironment()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution error:', error);
      process.exit(1);
    });
}

module.exports = { testProductionEnvironment };