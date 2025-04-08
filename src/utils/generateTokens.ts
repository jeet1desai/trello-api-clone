import jwt from 'jsonwebtoken';
import UserToken from '../model/userToken.model';
import { TOKEN_EXP } from '../config/app.config';

const generateTokens = async (user: { id: string; email: string }) => {
  try {
    const payload = { _id: user.id, email: user.email };
    const accessToken = jwt.sign(payload, process.env.TOKEN_PRIVATE_KEY as string, { expiresIn: TOKEN_EXP.access_token as any });
    const refreshToken = jwt.sign(payload, process.env.TOKEN_PRIVATE_KEY as string, { expiresIn: TOKEN_EXP.refresh_token as any });

    const userToken = await UserToken.findOne({ userId: user.id });
    if (userToken) await UserToken.deleteOne({ _id: userToken._id });

    await new UserToken({ userId: user.id, token: refreshToken }).save();
    return Promise.resolve({ accessToken, refreshToken });
  } catch (err) {
    return Promise.reject(err);
  }
};

export default generateTokens;
