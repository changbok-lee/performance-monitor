// Vercel Serverless Function - API 라우터
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Supabase 설정
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// JWT 설정
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'imweb-performance-monitor-secret-key-2024';
const SHARED_PASSWORD = process.env.SHARED_PASSWORD || 'qaai1234@!';
const ALLOWED_DOMAIN = '@imweb.me';
const ADMIN_EMAIL = 'changbok.lee@imweb.me';

const app = express();
app.use(cors());
app.use(express.json());

// ==================== Supabase Helper ====================

async function supabaseRequest(endpoint, options = {}) {
  const { method = 'GET', body, select, filters = '', count = false } = options;

  let url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  if (select) url += `?select=${select}`;
  if (filters) url += (select ? '&' : '?') + filters;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Range': '0-9999',  // Supabase 1000개 제한 우회
  };

  if (count) headers['Prefer'] = 'count=exact';
  if (method === 'POST') headers['Prefer'] = 'return=representation';
  if (method === 'DELETE' || method === 'PATCH') headers['Prefer'] = 'return=minimal';

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${error}`);
  }

  if (method === 'DELETE' || response.status === 204) {
    return { success: true };
  }

  const data = await response.json();

  if (count) {
    const range = response.headers.get('content-range');
    const total = range ? parseInt(range.split('/')[1]) : data.length;
    return { data, count: total };
  }

  return data;
}

// ==================== Auth Helper ====================

function validateEmailDomain(email) {
  if (!email || typeof email !== 'string') return false;
  const emailLower = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailLower)) return false;
  return emailLower.endsWith(ALLOWED_DOMAIN);
}

function validatePassword(password) {
  return password === SHARED_PASSWORD;
}

function generateToken(email) {
  return jwt.sign(
    { email, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.', code: 'NO_TOKEN' });
  }
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.', code: 'INVALID_TOKEN' });
  }
  req.user = decoded;
  next();
}

// ==================== Auth Routes ====================

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email) return res.status(400).json({ success: false, error: '이메일을 입력해주세요.' });
  if (!password) return res.status(400).json({ success: false, error: '비밀번호를 입력해주세요.' });
  if (!validateEmailDomain(email)) {
    return res.status(401).json({ success: false, error: '@imweb.me 이메일만 사용할 수 있습니다.' });
  }
  if (!validatePassword(password)) {
    return res.status(401).json({ success: false, error: '비밀번호가 올바르지 않습니다.' });
  }

  const token = generateToken(email);

  // 로그인 기록 저장
  try {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    await supabaseRequest('login_history', {
      method: 'POST',
      body: { email: email.toLowerCase(), ip_address: ip, user_agent: userAgent }
    });
  } catch (err) {
    console.error('로그인 기록 저장 실패:', err);
  }

  const isAdmin = email.toLowerCase() === ADMIN_EMAIL;
  res.json({ success: true, token, email, isAdmin, message: '로그인 성공' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  const isAdmin = req.user.email.toLowerCase() === ADMIN_EMAIL;
  res.json({ success: true, email: req.user.email, isAdmin });
});

// 접속 기록 조회 (관리자 전용)
app.get('/api/login-history', authMiddleware, async (req, res) => {
  // 관리자만 조회 가능
  if (req.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  try {
    // 1개월 이전 기록 삭제
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    await supabaseRequest(`login_history?login_at=lt.${oneMonthAgo.toISOString()}`, {
      method: 'DELETE'
    });

    // 최근 기록 조회
    const history = await supabaseRequest('login_history', {
      select: '*',
      filters: 'order=login_at.desc&limit=100'
    });
    res.json(history);
  } catch (err) {
    console.error('Login history error:', err);
    res.status(500).json({ error: '접속 기록 조회 실패' });
  }
});

// ==================== API Routes ====================

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const measurements = await supabaseRequest('measurements', { select: 'performance_score' });
    const validScores = measurements.filter(m => m.performance_score > 0);
    const avgPerformance = validScores.length > 0
      ? validScores.reduce((sum, m) => sum + m.performance_score, 0) / validScores.length
      : 0;

    const { count: totalUrls } = await supabaseRequest('url_master', {
      select: 'id', filters: 'is_active=eq.1', count: true
    });

    const { count: totalMeasurements } = await supabaseRequest('measurements', {
      select: 'id', count: true
    });

    res.json({ avg_performance: avgPerformance, total_urls: totalUrls, total_measurements: totalMeasurements });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: '통계 조회 실패' });
  }
});

app.get('/api/measurements', authMiddleware, async (req, res) => {
  try {
    const limit = req.query.limit || 10000;
    const measurements = await supabaseRequest('measurements', {
      select: '*',
      filters: `order=measured_at.desc&limit=${limit}`
    });
    res.json({ measurements, count: measurements.length });
  } catch (err) {
    console.error('Measurements error:', err);
    res.status(500).json({ error: '측정 결과 조회 실패' });
  }
});

app.get('/api/urls', authMiddleware, async (req, res) => {
  try {
    const urls = await supabaseRequest('url_master', {
      select: '*',
      filters: 'order=id.desc'
    });
    res.json(urls);
  } catch (err) {
    console.error('URLs error:', err);
    res.status(500).json({ error: 'URL 목록 조회 실패' });
  }
});

app.post('/api/urls', authMiddleware, async (req, res) => {
  const { url, site_name, page_detail, network } = req.body;
  if (!url || !network) {
    return res.status(400).json({ error: 'URL과 네트워크는 필수입니다.' });
  }
  try {
    const result = await supabaseRequest('url_master', {
      method: 'POST',
      body: { url, site_name, page_detail, network }
    });
    res.json({ success: true, id: result[0]?.id });
  } catch (err) {
    console.error('Add URL error:', err);
    res.status(500).json({ error: 'URL 추가 실패' });
  }
});

app.put('/api/urls/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { url, site_name, page_detail, network, is_active } = req.body;
  try {
    await supabaseRequest(`url_master?id=eq.${id}`, {
      method: 'PATCH',
      body: { url, site_name, page_detail, network, is_active }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Update URL error:', err);
    res.status(500).json({ error: 'URL 수정 실패' });
  }
});

app.delete('/api/urls/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseRequest(`url_master?id=eq.${id}`, { method: 'DELETE' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete URL error:', err);
    res.status(500).json({ error: 'URL 삭제 실패' });
  }
});

app.get('/api/measurement-status', authMiddleware, (req, res) => {
  res.json({ isRunning: false, total: 0, completed: 0, failed: 0 });
});

app.delete('/api/measurements', authMiddleware, async (req, res) => {
  try {
    await supabaseRequest('measurements?id=gt.0', { method: 'DELETE' });
    res.json({ success: true, message: '모든 측정 결과가 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete measurements error:', err);
    res.status(500).json({ success: false, error: '측정 결과 삭제 실패' });
  }
});

// Export for Vercel
module.exports = app;
