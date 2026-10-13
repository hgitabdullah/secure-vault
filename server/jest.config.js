import os from 'node:os';
import path from 'node:path';

// Set here (not in the npm script) so `npm test` also works on Windows cmd/PowerShell.
process.env.NODE_ENV = 'test';
process.env.LOCAL_STORAGE_DIR ||= path.join(os.tmpdir(), 'sv-test-storage');

export default {
  testEnvironment: 'node',
  transform: {},
  testTimeout: 60000,
  testMatch: ['**/tests/**/*.test.js'],
};
