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

// URL 일괄 추가 (엑셀 복사-붙여넣기용)
app.post('/api/urls/bulk', authMiddleware, async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, error: 'URL 목록이 필요합니다.' });
  }

  try {
    const results = { success: 0, failed: 0, errors: [] };

    for (const urlData of urls) {
      try {
        if (!urlData.url || !urlData.network) {
          results.failed++;
          results.errors.push(`URL 또는 네트워크 누락: ${urlData.url || 'unknown'}`);
          continue;
        }

        await supabaseRequest('url_master', {
          method: 'POST',
          body: {
            url: urlData.url,
            site_name: urlData.site_name || null,
            page_detail: urlData.page_detail || null,
            network: urlData.network,
            is_active: 1
          }
        });
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${urlData.url}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `${results.success}개 URL 추가 완료, ${results.failed}개 실패`,
      results
    });
  } catch (err) {
    console.error('Bulk URL add error:', err);
    res.status(500).json({ success: false, error: 'URL 일괄 추가 실패: ' + err.message });
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

// ==================== 개선사항 Report API ====================

// 개선사항 Report 데이터 조회
app.get('/api/improvement-report', authMiddleware, async (req, res) => {
  try {
    // 최근 10일간의 측정 데이터 조회 (suggestions가 있는 것만)
    const since = new Date();
    since.setDate(since.getDate() - 10);
    const sinceStr = since.toISOString();

    const measurements = await supabaseRequest('measurements', {
      select: 'id,url,site_name,page_detail,network,suggestions,measured_at',
      filters: `measured_at=gte.${sinceStr}&suggestions=not.is.null&order=measured_at.desc`
    });

    // suggestions 파싱 및 집계
    const issueStats = {};

    measurements.forEach(m => {
      if (!m.suggestions) return;

      const suggestions = m.suggestions.split(' | ');

      suggestions.forEach(suggestion => {
        const match = suggestion.match(/^(.+?):\s*약\s*([\d.]+)(초|ms)\s*개선 가능$/);

        if (match) {
          const issueTitle = match[1].trim();
          const value = parseFloat(match[2]);
          const unit = match[3];
          const impactSeconds = unit === 'ms' ? value / 1000 : value;

          if (!issueStats[issueTitle]) {
            issueStats[issueTitle] = {
              title: issueTitle,
              count: 0,
              totalImpact: 0,
              pageDetails: new Set()
            };
          }

          issueStats[issueTitle].count++;
          issueStats[issueTitle].totalImpact += impactSeconds;

          if (m.page_detail) {
            issueStats[issueTitle].pageDetails.add(m.page_detail);
          }
        }
      });
    });

    // 배열로 변환 및 정렬
    const issueList = Object.values(issueStats).map(issue => ({
      title: issue.title,
      count: issue.count,
      totalImpact: issue.totalImpact,
      avgImpact: issue.totalImpact / issue.count,
      pageDetails: Array.from(issue.pageDetails)
    }));

    // 복합 점수로 정렬 (빈도 * 평균 임팩트)
    issueList.sort((a, b) => {
      const scoreA = a.count * a.avgImpact;
      const scoreB = b.count * b.avgImpact;
      return scoreB - scoreA;
    });

    // TOP 20
    const top20 = issueList.slice(0, 20);

    // 캐시된 개선 제안 조회
    let cachedSuggestions = {};
    try {
      const cached = await supabaseRequest('improvement_suggestions', {
        select: '*',
        filters: 'order=id.asc'
      });
      cached.forEach(c => {
        cachedSuggestions[c.issue_key] = c.solution;
      });
    } catch (e) {
      console.log('캐시 테이블 없음 - 새로 생성 필요');
    }

    // 결과에 캐시된 개선 제안 추가
    const result = top20.map((issue, index) => ({
      rank: index + 1,
      title: issue.title,
      count: issue.count,
      totalImpact: issue.totalImpact.toFixed(2),
      avgImpact: issue.avgImpact.toFixed(2),
      pageDetails: issue.pageDetails,
      solution: cachedSuggestions[issue.title] || null
    }));

    // 날짜 범위 계산
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10);

    res.json({
      success: true,
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      totalMeasurements: measurements.length,
      issues: result
    });

  } catch (error) {
    console.error('개선사항 Report 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '개선사항 Report 조회 실패: ' + error.message
    });
  }
});

// Gemini로 개선 제안 생성
app.post('/api/generate-solution', authMiddleware, async (req, res) => {
  const { issueTitle } = req.body;

  if (!issueTitle) {
    return res.status(400).json({
      success: false,
      error: '문제점 제목이 필요합니다.'
    });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    return res.status(500).json({
      success: false,
      error: 'GEMINI_API_KEY가 설정되지 않았습니다.'
    });
  }

  try {
    const prompt = `다음 웹 성능 문제에 대한 구체적인 해결 방법을 제시해주세요:
"${issueTitle}"

요구사항:
1. 웹빌더 플랫폼(아임웹, Shopify 등) FE 엔지니어가 이해하고 바로 적용할 수 있는 수준으로 작성
2. 구체적인 코드 예시 포함 (JavaScript, CSS, HTML 등)
3. 웹빌더 특성상 사용자 커스텀 코드와의 호환성 고려
4. 성능 개선 효과 수치 언급
5. 주의사항이나 사이드 이펙트 명시

중요: 인사말이나 자기소개 없이 바로 본문부터 시작하세요.

형식:
## 문제 원인
(간단히 1-2줄)

## 해결 방법
### 1. 첫 번째 방법
(설명 + 코드)

### 2. 두 번째 방법 (있다면)
(설명 + 코드)

## 기대 효과
(성능 개선 수치)

## 주의사항
(사이드 이펙트, 호환성 등)`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const solution = data.candidates[0].content.parts[0].text;

    // 캐시에 저장
    try {
      const existing = await supabaseRequest('improvement_suggestions', {
        select: 'id',
        filters: `issue_key=eq.${encodeURIComponent(issueTitle)}`
      });

      if (existing && existing.length > 0) {
        await supabaseRequest(`improvement_suggestions?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: { solution, updated_at: new Date().toISOString() }
        });
      } else {
        await supabaseRequest('improvement_suggestions', {
          method: 'POST',
          body: { issue_key: issueTitle, solution, created_at: new Date().toISOString() }
        });
      }
    } catch (e) {
      console.log('캐시 저장 실패:', e.message);
    }

    res.json({ success: true, solution });

  } catch (error) {
    console.error('Gemini API 호출 실패:', error.message);
    res.status(500).json({
      success: false,
      error: 'AI 개선 제안 생성 실패: ' + error.message
    });
  }
});

// Export for Vercel
module.exports = app;
