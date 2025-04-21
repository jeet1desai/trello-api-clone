import CryptoJS from 'crypto-js';
require('dotenv').config();

const key = CryptoJS.enc.Utf8.parse(process.env.SECRET_KEY!);
const iv = CryptoJS.enc.Utf8.parse(process.env.SECRET_IV!);
const isEncEnabled = process.env.ENC_DEC_ENABLED === 'true' || process.env.ENC_DEC_ENABLED === '1';

const base64ToUrlSafe = (base64: any) => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const urlSafeToBase64 = (urlSafe: any) => {
  const base64 = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
  return base64 + '==='.slice(0, (4 - (base64.length % 4)) % 4);
};

export const encrypt = (data: any) => {
  if (!isEncEnabled) return data;

  const serialized = JSON.stringify(data, (key, value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && value?._bsontype === 'ObjectID') return value.toString();
    return value;
  });

  const ciphertext = CryptoJS.AES.encrypt(serialized, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();

  return base64ToUrlSafe(ciphertext);
};

export const decrypt = (encryptedData: any) => {
  if (!isEncEnabled) return encryptedData;

  const base64Encrypted = urlSafeToBase64(encryptedData);

  const bytes = CryptoJS.AES.decrypt(base64Encrypted, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return bytes.toString(CryptoJS.enc.Utf8);
};
