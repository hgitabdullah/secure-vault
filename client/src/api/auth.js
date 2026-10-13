/**
 * Account flows that combine crypto + API calls.
 * See crypto/core.js for the key hierarchy.
 */
import { api } from './http.js';
import { useAuth } from '../stores/auth.js';
import {
  createAccountKeys, deriveLoginKeys, unwrapKey, rewrapForPassword, parseRecoveryKey, recoveryKeys,
} from '../crypto/core.js';

/** Register: generate MK + recovery key locally, send only wrapped keys. */
export async function register({ name, email, password }) {
  const keys = await createAccountKeys(password);
  const res = await api('POST', '/auth/register', { name, email, ...keys.payload });
  // Hold the session until the user has saved the recovery key (kept in memory,
  // never in history/localStorage). RecoveryKey.jsx activates it.
  useAuth.setState({ pending: { recoveryKey: keys.recoveryKey, email, accessToken: res.accessToken, user: res.user, masterKey: keys.masterKey } });
  return { recoveryKey: keys.recoveryKey };
}

/** Step 1 of login: derive keys from password. Returns 2FA ticket or unlocks the vault. */
export async function login({ email, password }) {
  const pre = await api('POST', '/auth/prelogin', { email });
  const { kek, authKey } = await deriveLoginKeys(password, pre.kdfSalt, pre.kdfParams);
  const res = await api('POST', '/auth/login', { email, authKey });
  if (res.twoFactorRequired) return { twoFactorRequired: true, ticket: res.ticket, kek };
  await finishLogin(res, kek);
  return { ok: true };
}

/** Step 2 (optional): verify the TOTP/backup code. */
export async function verify2fa({ ticket, code, kek }) {
  const res = await api('POST', '/auth/2fa/verify', { ticket, code });
  await finishLogin(res, kek);
}

async function finishLogin(res, kek) {
  // Unwrap the master key with the KEK; this fails if the password was wrong.
  const mk = await unwrapKey(kek, res.user.encMasterKey);
  useAuth.getState().setSession(res.accessToken, res.user, mk);
}

export async function logout() {
  await api('POST', '/auth/logout').catch(() => {});
  useAuth.getState().clear();
}

/** Change password: prove the old one, re-wrap MK with a new KEK. Files stay as they are. */
export async function changePassword(current, next) {
  const { user, masterKey } = useAuth.getState();
  const { authKey: currentAuthKey } = await deriveLoginKeys(current, user.kdfSalt, user.kdfParams);
  const payload = await rewrapForPassword(masterKey, next);
  const res = await api('POST', '/auth/password', { currentAuthKey, ...payload });
  useAuth.getState().setUser(res.user);
}

/** Forgot password: decrypt MK with the recovery key, set a new password. */
export async function recoverAccount({ email, recoveryKey, newPassword }) {
  const rk = parseRecoveryKey(recoveryKey);
  const { key, proof } = await recoveryKeys(rk);
  const { encMasterKeyRecovery } = await api('POST', '/auth/recover/start', { email, recoveryProof: proof });
  const mk = await unwrapKey(key, encMasterKeyRecovery);
  const payload = await rewrapForPassword(mk, newPassword);
  await api('POST', '/auth/recover', { email, recoveryProof: proof, ...payload });
}

/** Re-derive the auth key for sensitive actions (e.g. delete account). */
export async function authKeyFor(password) {
  const { user } = useAuth.getState();
  return (await deriveLoginKeys(password, user.kdfSalt, user.kdfParams)).authKey;
}
