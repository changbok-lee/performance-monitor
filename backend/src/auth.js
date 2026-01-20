const jwt = require('jsonwebtoken');

// JWT 비밀키 (환경변수에서 가져오거나 기본값 사용)
const JWT_SECRET = process.env.JWT_SECRET || 'imweb-performance-monitor-secret-key-2024';

// 공용 비밀번호
const SHARED_PASSWORD = process.env.SHARED_PASSWORD || 'qaai1234@!';

// 허용된 이메일 도메인
const ALLOWED_DOMAIN = '@imweb.me';

// 이메일 도메인 검증
function validateEmailDomain(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailLower = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(emailLower)) {
    return false;
  }

  return emailLower.endsWith(ALLOWED_DOMAIN);
}

// 비밀번호 검증
function validatePassword(password) {
  return password === SHARED_PASSWORD;
}

// JWT 토큰 생성
function generateToken(email) {
  return jwt.sign(
    { email, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// JWT 토큰 검증
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// 인증 미들웨어
function authMiddleware(req, res, next) {
  // Authorization 헤더에서 토큰 추출
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: '인증이 필요합니다.',
      code: 'NO_TOKEN'
    });
  }

  const token = authHeader.substring(7); // 'Bearer ' 제거
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      error: '유효하지 않은 토큰입니다.',
      code: 'INVALID_TOKEN'
    });
  }

  // 토큰 정보를 요청 객체에 추가
  req.user = decoded;
  next();
}

module.exports = {
  JWT_SECRET,
  SHARED_PASSWORD,
  ALLOWED_DOMAIN,
  validateEmailDomain,
  validatePassword,
  generateToken,
  verifyToken,
  authMiddleware
};
