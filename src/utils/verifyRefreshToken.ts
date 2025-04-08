import UserToken from '../model/userToken.model';
import jwt from 'jsonwebtoken';

export interface TokenDetails {
  _id: string;
  email: string;
  iat: number;
  exp: number;
}

export interface VerifyRefreshTokenResponse {
  tokenDetails: TokenDetails;
  error: boolean;
  message: string;
}

const verifyRefreshToken = async (refreshToken: string) => {
  const privateKey: string | undefined = process.env.TOKEN_PRIVATE_KEY;

  try {
    const doc = await UserToken.findOne({ token: refreshToken });
    if (!doc) {
      throw { error: true, message: 'Invalid refresh token' };
    }

    const tokenDetails = jwt.verify(refreshToken, privateKey as string);

    return {
      tokenDetails,
      error: false,
      message: 'Valid refresh token',
    } as VerifyRefreshTokenResponse;
  } catch (err) {
    throw {
      error: true,
      message: 'Invalid refresh token',
    };
  }
};

export default verifyRefreshToken;
