type AuthFn = () => Promise<any>;

let authImpl: AuthFn;

if (process.env.MOCK_LOCAL_AUTH === '1') {
  authImpl = async () => null;
} else {
  authImpl = require('../../auth').auth as AuthFn;
}

export const auth = () => authImpl();
