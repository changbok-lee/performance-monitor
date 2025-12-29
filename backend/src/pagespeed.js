const axios = require('axios');

// ==================== 문제점 추출 ====================

function extractDiagnostics(lighthouseResult) {
  const audits = lighthouseResult.audits;
  const issues = [];

  // LCP 체크 (2.5초 초과)
  if (audits['largest-contentful-paint']) {
    const lcp = audits['largest-contentful-paint'].numericValue / 1000;
    if (lcp > 2.5) {
      issues.push(`LCP 느림 (${lcp.toFixed(2)}초) - 주요 콘텐츠 로딩 지연`);
    }
  }

  // FCP 체크 (1.8초 초과)
  if (audits['first-contentful-paint']) {
    const fcp = audits['first-contentful-paint'].numericValue / 1000;
    if (fcp > 1.8) {
      issues.push(`FCP 느림 (${fcp.toFixed(2)}초) - 첫 콘텐츠 표시 지연`);
    }
  }

  // TBT 체크 (200ms 초과)
  if (audits['total-blocking-time']) {
    const tbt = audits['total-blocking-time'].numericValue;
    if (tbt > 200) {
      issues.push(`TBT 높음 (${tbt.toFixed(0)}ms) - JavaScript 실행 시간 과다`);
    }
  }

  // CLS 체크 (0.1 초과)
  if (audits['cumulative-layout-shift']) {
    const cls = audits['cumulative-layout-shift'].numericValue;
    if (cls > 0.1) {
      issues.push(`CLS 높음 (${cls.toFixed(3)}) - 레이아웃 불안정`);
    }
  }

  // Speed Index 체크 (3.4초 초과)
  if (audits['speed-index']) {
    const si = audits['speed-index'].numericValue / 1000;
    if (si > 3.4) {
      issues.push(`Speed Index 느림 (${si.toFixed(2)}초) - 시각적 로딩 지연`);
    }
  }

  // TTI 체크 (3.8초 초과)
  if (audits['interactive']) {
    const tti = audits['interactive'].numericValue / 1000;
    if (tti > 3.8) {
      issues.push(`TTI 느림 (${tti.toFixed(2)}초) - 인터랙션 지연`);
    }
  }

  return issues;
}

// ==================== 개선 제안 추출 ====================

function extractOpportunities(lighthouseResult) {
  const audits = lighthouseResult.audits;
  const opportunities = [];

  const opportunityAudits = [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'modern-image-formats',
    'offscreen-images',
    'unminified-css',
    'unminified-javascript',
    'efficient-animated-content',
    'duplicated-javascript',
    'legacy-javascript',
    'total-byte-weight',
    'uses-optimized-images',
    'uses-text-compression',
    'uses-responsive-images',
    'server-response-time'
  ];

  const auditLabels = {
    'render-blocking-resources': '렌더링 차단 리소스 제거',
    'unused-css-rules': '사용하지 않는 CSS 제거',
    'unused-javascript': '사용하지 않는 JavaScript 제거',
    'modern-image-formats': '최신 이미지 형식 사용',
    'offscreen-images': '화면 밖 이미지 지연 로딩',
    'unminified-css': 'CSS 압축',
    'unminified-javascript': 'JavaScript 압축',
    'efficient-animated-content': '효율적인 애니메이션',
    'duplicated-javascript': '중복 JavaScript 제거',
    'legacy-javascript': '레거시 JavaScript 제거',
    'total-byte-weight': '전체 페이로드 크기 줄이기',
    'uses-optimized-images': '이미지 최적화',
    'uses-text-compression': '텍스트 압축 사용',
    'uses-responsive-images': '반응형 이미지 사용',
    'server-response-time': '서버 응답 시간 단축'
  };

  opportunityAudits.forEach(auditId => {
    const audit = audits[auditId];
    if (audit && audit.score !== null && audit.score < 1) {
      const savings = audit.numericValue || 0;
      if (savings > 100) {
        const label = auditLabels[auditId] || auditId;
        const savingsText = savings > 1000 
          ? `약 ${(savings / 1000).toFixed(1)}초 개선 가능`
          : `약 ${savings.toFixed(0)}ms 개선 가능`;
        
        opportunities.push(`${label}: ${savingsText}`);
      }
    }
  });

  return opportunities.slice(0, 5);
}

// ==================== 성능 측정 ====================

async function measurePageSpeed(url, network = 'Mobile') {
  const apiKey = process.env.PAGESPEED_API_KEY;
  
  if (!apiKey) {
    throw new Error('PAGESPEED_API_KEY가 설정되지 않았습니다.');
  }

  console.log(`측정 시작: ${url} (${network})`);

  const strategy = network === 'Mobile' ? 'mobile' : 'desktop';
  
  // 네트워크별 throttling 설정
  const throttling = network === 'Mobile'
    ? {
        rttMs: 400,
        throughputKbps: 400,
        requestLatencyMs: 400,
        downloadThroughputKbps: 400,
        uploadThroughputKbps: 400,
        cpuSlowdownMultiplier: 4
      }
    : {
        rttMs: 10,
        throughputKbps: 102400,
        requestLatencyMs: 10,
        downloadThroughputKbps: 102400,
        uploadThroughputKbps: 51200,
        cpuSlowdownMultiplier: 1
      };

  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`;

  try {
    const response = await axios.get(apiUrl, {
      params: {
        url: encodeURIComponent(url),
        strategy: strategy,
        category: 'performance',
        key: apiKey
      },
      timeout: 120000
    });

    const lighthouseResult = response.data.lighthouseResult;
    const categories = lighthouseResult.categories;
    const audits = lighthouseResult.audits;

    const performanceScore = Math.round(categories.performance.score * 100);

    const metrics = {
      fcp: audits['first-contentful-paint']?.numericValue / 1000 || 0,
      lcp: audits['largest-contentful-paint']?.numericValue / 1000 || 0,
      tbt: audits['total-blocking-time']?.numericValue || 0,
      cls: audits['cumulative-layout-shift']?.numericValue || 0,
      speed_index: audits['speed-index']?.numericValue / 1000 || 0,
      tti: audits['interactive']?.numericValue / 1000 || 0
    };

    const issues = extractDiagnostics(lighthouseResult);
    const suggestions = extractOpportunities(lighthouseResult);

    let status = 'Good';
    if (performanceScore < 90) status = 'Needs Improvement';
    if (performanceScore < 50) status = 'Poor';

    const result = {
      url: url,
      network: network,
      measured_at: new Date().toISOString(),
      performance_score: performanceScore,
      status: status,
      fcp: metrics.fcp,
      lcp: metrics.lcp,
      tbt: metrics.tbt,
      cls: metrics.cls,
      speed_index: metrics.speed_index,
      tti: metrics.tti,
      measurement_time: new Date().toLocaleString('ko-KR'),
      issues: issues.length > 0 ? issues.join(' | ') : null,
      suggestions: suggestions.length > 0 ? suggestions.join(' | ') : null
    };

    console.log(`✅ 완료: ${url} - ${performanceScore}점`);
    console.log(`  - 문제점: ${result.issues || '없음'}`);
    console.log(`  - 개선안: ${result.suggestions || '없음'}`);

    return result;

  } catch (error) {
    console.error(`❌ 측정 실패: ${url}`, error.message);
    throw error;
  }
}

module.exports = {
  measurePageSpeed
};