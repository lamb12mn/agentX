import { execSync } from 'child_process';
const result = execSync('node_modules\\.bin\\vitest.cmd run --reporter=json', {
  cwd: 'd:\\xiaoyue\\mcps\\agentX\\agentx-mcp',
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
});
const data = JSON.parse(result);
console.log(`Total suites: ${data.testResults.length}`);
console.log(`Passed: ${data.testResults.filter(r => r.status === 'passed').length}`);
console.log(`Failed: ${data.testResults.filter(r => r.status === 'failed').length}`);
console.log(`Total tests: ${data.numTotalTests}`);
console.log(`Passed tests: ${data.numPassedTests}`);
console.log(`Failed tests: ${data.numFailedTests}`);
if (data.numFailedTests > 0) {
  for (const suite of data.testResults) {
    if (suite.status === 'failed') {
      console.log(`\nFAILED SUITE: ${suite.name}`);
      for (const assertion of suite.assertionResults) {
        if (assertion.status === 'failed') {
          console.log(`  TEST: ${assertion.fullName}`);
          const msg = assertion.failureMessages?.[0] || 'no message';
          console.log(`  ERROR: ${msg.slice(0, 500)}`);
        }
      }
    }
  }
}
