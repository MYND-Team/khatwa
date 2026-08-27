import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // userId
  username: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // unique token id to allow revocation
}

const defaultAccessSecret = 'khatwa_default_jwt_access_secret_key_32_chars_min_2026';
const defaultRefreshSecret = 'khatwa_default_jwt_refresh_secret_key_32_chars_min_2026';

const accessSecret = process.env.JWT_ACCESS_SECRET || env?.JWT_ACCESS_SECRET || defaultAccessSecret;
const refreshSecret = process.env.JWT_REFRESH_SECRET || env?.JWT_REFRESH_SECRET || defaultRefreshSecret;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, accessSecret, {
    expiresIn: (env?.JWT_ACCESS_EXPIRES_IN || '15m') as any,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, refreshSecret, {
    expiresIn: (env?.JWT_REFRESH_EXPIRES_IN || '7d') as any,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, refreshSecret) as RefreshTokenPayload;
}
