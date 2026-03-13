const Module = require('module');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  if (request === 'next/server') {
    return originalResolveFilename.call(this, 'next/server.js', parent, isMain, options);
  }

  if (process.env.MOCK_LOCAL_AUTH === '1' && request === '@/auth') {
    return originalResolveFilename.call(this, path.join(projectRoot, 'scripts/mock-auth.js'), parent, isMain, options);
  }

  if (request.startsWith('@/')) {
    const nextRequest = path.join(projectRoot, request.slice(2));
    return originalResolveFilename.call(this, nextRequest, parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
