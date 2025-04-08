import jwt from 'jsonwebtoken';
import UserToken from '../model/userToken.model';
import {
  accessTokenExpireTime,
  refreshTokenExpireTime,
} from '../helper/constant';

const generateTokens = async (user: { id: string; email: string }) => {
  try {
    const payload = { _id: user.id, email: user.email };
    const accessToken = jwt.sign(
      payload,
      process.env.ACCESS_TOKEN_PRIVATE_KEY as string,
      { expiresIn: accessTokenExpireTime }
    );
    const refreshToken = jwt.sign(
      payload,
      process.env.REFRESH_TOKEN_PRIVATE_KEY as string,
      { expiresIn: refreshTokenExpireTime }
    );

    const userToken = await UserToken.findOne({ userId: user.id });
    if (userToken) await UserToken.deleteOne({ _id: userToken._id });

    await new UserToken({ userId: user.id, token: refreshToken }).save();
    return Promise.resolve({ accessToken, refreshToken });
  } catch (err) {
    return Promise.reject(err);
  }
};

export default generateTokens;
