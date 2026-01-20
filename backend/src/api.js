require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Supabase 모듈 import (SQLite 대신)
const supabase = require('./supabase');

// 인증 모듈 import
const auth = require('./auth');

// pagespeed 함수들 import
const pagespeed = require('./pagespeed');
const measurePageSpeed = pagespeed.measurePageSpeed;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend')));

// 측정 상태 관리
let isMeasurementRunning = false;
let measurementStatus = {
  isRunning: false,
  total: 0,
  completed: 0,
  failed: 0
};
let measurementTimeout = null;

// ==================== 인증 API ====================

// 로그인 API
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  // 이메일 필수 확인
  if (!email) {
    return res.status(400).json({
      success: false,
      error: '이메일을 입력해주세요.'
    });
  }

  // 비밀번호 필수 확인
  if (!password) {
    return res.status(400).json({
      success: false,
      error: '비밀번호를 입력해주세요.'
    });
  }

  // 이메일 도메인 검증
  if (!auth.validateEmailDomain(email)) {
    return res.status(401).json({
      success: false,
      error: '@imweb.me 이메일만 사용할 수 있습니다.'
    });
  }

  // 비밀번호 검증
  if (!auth.validatePassword(password)) {
    return res.status(401).json({
      success: false,
      error: '비밀번호가 올바르지 않습니다.'
    });
  }

  // JWT 토큰 발급
  const token = auth.generateToken(email);

  res.json({
    success: true,
    token,
    email,
    message: '로그인 성공'
  });
});

// 토큰 검증 API
app.get('/api/auth/verify', auth.authMiddleware, (req, res) => {
  res.json({
    success: true,
    email: req.user.email
  });
});

// ==================== API Routes (인증 필요) ====================

// 통계 API
app.get('/api/stats', auth.authMiddleware, async (req, res) => {
  try {
    const stats = await supabase.getStats();
    res.json(stats);
  } catch (err) {
    console.error('통계 조회 실패:', err);
    res.status(500).json({ error: '통계 조회 실패' });
  }
});

// 측정 결과 조회 API
app.get('/api/measurements', auth.authMiddleware, async (req, res) => {
  try {
    const limit = req.query.limit || 10000;
    const measurements = await supabase.getMeasurements(limit);

    res.json({
      measurements: measurements,
      count: measurements.length
    });
  } catch (err) {
    console.error('측정 결과 조회 실패:', err);
    res.status(500).json({ error: '측정 결과 조회 실패' });
  }
});

// URL 목록 조회
app.get('/api/urls', auth.authMiddleware, async (req, res) => {
  try {
    const urls = await supabase.getAllUrls();
    res.json(urls);
  } catch (err) {
    console.error('URL 목록 조회 실패:', err);
    res.status(500).json({ error: 'URL 목록 조회 실패' });
  }
});

// URL 추가
app.post('/api/urls', auth.authMiddleware, async (req, res) => {
  const { url, site_name, page_detail, network } = req.body;

  if (!url || !network) {
    return res.status(400).json({ error: 'URL과 네트워크는 필수입니다.' });
  }

  try {
    const result = await supabase.addUrl(url, site_name, page_detail, network);
    res.json({
      success: true,
      id: result.id
    });
  } catch (err) {
    console.error('URL 추가 실패:', err);
    res.status(500).json({ error: 'URL 추가 실패' });
  }
});

// URL 수정
app.put('/api/urls/:id', auth.authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { url, site_name, page_detail, network, is_active } = req.body;

  try {
    await supabase.updateUrl(id, { url, site_name, page_detail, network, is_active });
    res.json({
      success: true
    });
  } catch (err) {
    console.error('URL 수정 실패:', err);
    res.status(500).json({ error: 'URL 수정 실패' });
  }
});

// URL 삭제
app.delete('/api/urls/:id', auth.authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    await supabase.deleteUrl(id);
    res.json({
      success: true
    });
  } catch (err) {
    console.error('URL 삭제 실패:', err);
    res.status(500).json({ error: 'URL 삭제 실패' });
  }
});

// 성능 측정 시작
app.post('/api/measure', auth.authMiddleware, async (req, res) => {
  if (isMeasurementRunning) {
    return res.json({
      success: false,
      message: '이미 측정이 진행 중입니다.'
    });
  }

  try {
    // 네트워크 필터 받기
    const { network } = req.body;

    let urls = await supabase.getActiveUrls();

    // 네트워크 필터링
    if (network && network !== 'all') {
      urls = urls.filter(u => u.network === network);
      console.log(`\n📱 네트워크 필터: ${network} (${urls.length}개)`);
    }

    if (urls.length === 0) {
      return res.json({
        success: false,
        message: '측정할 URL이 없습니다.'
      });
    }

    // 측정 시작
    isMeasurementRunning = true;
    measurementStatus = {
      isRunning: true,
      total: urls.length,
      completed: 0,
      failed: 0
    };

    // 타임아웃 설정 (180분)
    measurementTimeout = setTimeout(() => {
      if (isMeasurementRunning) {
        console.log('\n⏱️  측정 타임아웃 (180분)');
        isMeasurementRunning = false;
        measurementStatus.isRunning = false;
      }
    }, 180 * 60 * 1000);

    res.json({
      success: true,
      count: urls.length,
      network: network || 'all'
    });

    // 비동기로 측정 실행
    measureAndSave(urls).then(() => {
      isMeasurementRunning = false;
      measurementStatus.isRunning = false;

      // 타임아웃 클리어
      if (measurementTimeout) {
        clearTimeout(measurementTimeout);
        measurementTimeout = null;
      }

      console.log('\n✅ 모든 측정 완료!');
    }).catch(error => {
      isMeasurementRunning = false;
      measurementStatus.isRunning = false;

      // 타임아웃 클리어
      if (measurementTimeout) {
        clearTimeout(measurementTimeout);
        measurementTimeout = null;
      }

      console.error('\n❌ 측정 중 오류:', error);
    });

  } catch (error) {
    console.error('측정 시작 실패:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

// 측정 상태 조회
app.get('/api/measurement-status', auth.authMiddleware, (req, res) => {
  res.json(measurementStatus);
});

// 측정 결과 전체 삭제
app.delete('/api/measurements', auth.authMiddleware, async (req, res) => {
  try {
    await supabase.deleteAllMeasurements();
    res.json({
      success: true,
      message: '모든 측정 결과가 삭제되었습니다.'
    });
  } catch (err) {
    console.error('측정 결과 삭제 실패:', err);
    res.status(500).json({
      success: false,
      error: '측정 결과 삭제 실패'
    });
  }
});

// ==================== 개선사항 Report API ====================

// 개선사항 Report 데이터 조회
app.get('/api/improvement-report', auth.authMiddleware, async (req, res) => {
  try {
    // 최근 10일간의 측정 데이터 조회
    const measurements = await supabase.getRecentMeasurementsWithIssues(10);

    // suggestions 파싱 및 집계
    const issueStats = {};

    measurements.forEach(m => {
      if (!m.suggestions) return;

      // " | "로 구분된 suggestions 파싱
      const suggestions = m.suggestions.split(' | ');

      suggestions.forEach(suggestion => {
        // "렌더링 차단 리소스 제거: 약 1.2초 개선 가능" 형태 파싱
        const match = suggestion.match(/^(.+?):\s*약\s*([\d.]+)(초|ms)\s*개선 가능$/);

        if (match) {
          const issueTitle = match[1].trim();
          const value = parseFloat(match[2]);
          const unit = match[3];

          // ms를 초로 변환
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
      const cached = await supabase.getImprovementSuggestions();
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
app.post('/api/generate-solution', auth.authMiddleware, async (req, res) => {
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
    const axios = require('axios');

    const prompt = `당신은 아임웹, Shopify 같은 웹빌더 플랫폼의 프론트엔드 성능 최적화 전문가입니다.

다음 웹 성능 문제에 대한 구체적인 해결 방법을 제시해주세요:
"${issueTitle}"

요구사항:
1. 웹빌더 플랫폼 FE 엔지니어가 이해하고 바로 적용할 수 있는 수준으로 작성
2. 구체적인 코드 예시 포함 (JavaScript, CSS, HTML 등)
3. 웹빌더 특성상 사용자 커스텀 코드와의 호환성 고려
4. 성능 개선 효과 수치 언급
5. 주의사항이나 사이드 이펙트 명시

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

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const solution = response.data.candidates[0].content.parts[0].text;

    // 캐시에 저장
    try {
      await supabase.saveImprovementSuggestion(issueTitle, solution);
    } catch (e) {
      console.log('캐시 저장 실패 (테이블 없음):', e.message);
    }

    res.json({
      success: true,
      solution
    });

  } catch (error) {
    console.error('Gemini API 호출 실패:', error.message);
    res.status(500).json({
      success: false,
      error: 'AI 개선 제안 생성 실패: ' + error.message
    });
  }
});

// ==================== 측정 함수 ====================

async function measureAndSave(urls) {
  console.log(`\n📊 ${urls.length}개 URL 측정 시작`);

  for (let i = 0; i < urls.length; i++) {
    const urlItem = urls[i];

    try {
      console.log(`\n[${i + 1}/${urls.length}] 측정 중: ${urlItem.url} (${urlItem.network})`);

      const result = await measurePageSpeed(urlItem.url, urlItem.network);

      result.url_master_id = urlItem.id;
      result.site_name = urlItem.site_name;
      result.page_detail = urlItem.page_detail;

      await supabase.saveMeasurement(result);

      measurementStatus.completed++;
      console.log(`✅ 완료: ${measurementStatus.completed}/${urls.length}`);

    } catch (error) {
      measurementStatus.failed++;
      console.error(`❌ 실패 (${i + 1}/${urls.length}): ${urlItem.url}`, error.message);

      try {
        await supabase.saveMeasurement({
          url_master_id: urlItem.id,
          url: urlItem.url,
          site_name: urlItem.site_name,
          page_detail: urlItem.page_detail,
          network: urlItem.network,
          measured_at: new Date().toISOString(),
          performance_score: 0,
          status: 'Failed',
          fcp: 0,
          lcp: 0,
          tbt: 0,
          speed_index: 0,
          cls: 0,
          tti: 0,
          measurement_time: new Date().toLocaleString('ko-KR'),
          error: error.message,
          issues: null,
          suggestions: null
        });
      } catch (saveError) {
        console.error('저장 실패:', saveError.message);
      }
    }

    if (i < urls.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`\n🎉 측정 완료: 성공 ${measurementStatus.completed}개, 실패 ${measurementStatus.failed}개`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 서버 시작 ====================

async function startServer() {
  app.listen(PORT, () => {
    console.log(`\n🚀 서버 실행 중: http://localhost:${PORT}`);
    console.log(`📊 대시보드: http://localhost:${PORT}/index.html`);
    console.log(`⚙️  URL 관리: http://localhost:${PORT}/url-manager.html`);
    console.log(`\n💡 Supabase 연결됨: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
  });
}

// Vercel serverless 환경인지 확인
if (process.env.VERCEL) {
  // Vercel에서는 module.exports로 app 내보내기
  module.exports = app;
} else {
  // 로컬 환경에서는 서버 시작
  startServer();
}
