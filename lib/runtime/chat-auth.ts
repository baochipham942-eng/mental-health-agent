import { auth as realAuth } from '../../auth';

type AuthFn = () => Promise<any>;

const authImpl: AuthFn = process.env.MOCK_LOCAL_AUTH === '1'
  ? async () => null
  : (realAuth as AuthFn);

export const auth = () => authImpl();
