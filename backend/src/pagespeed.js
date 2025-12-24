require('dotenv').config();
const axios = require('axios');

const PAGESPEED_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const API_KEY = process.env.PAGESPEED_API_KEY;

// 성능 측정 함수
async function measurePageSpeed(url, network = 'MOBILE') {
  console.log(`측정 시작: ${url} (${network})`);
  
  try {
    const strategy = network === 'Mobile' ? 'MOBILE' : 'DESKTOP';
    
    // PageSpeed API 호출
    const response = await axios.get(PAGESPEED_API_URL, {
      params: {
        url: url,
        strategy: strategy,
        category: 'PERFORMANCE',
        key: API_KEY
      }
    });

    const data = response.data;
    const lighthouse = data.lighthouseResult;
    const audits = lighthouse.audits;

    // 개선 기회 추출 (상위 3개)
    const opportunities = extractOpportunities(audits);
    const diagnostics = extractDiagnostics(audits);

    // 성능 지표 추출
    const result = {
      url: url,
      network: network,
      measured_at: new Date().toISOString(),
      
      // Core Web Vitals
      performance_score: Math.round(lighthouse.categories.performance.score * 100),
      fcp: audits['first-contentful-paint'].numericValue / 1000,
      lcp: audits['largest-contentful-paint'].numericValue / 1000,
      cls: audits['cumulative-layout-shift'].numericValue,
      tbt: Math.round(audits['total-blocking-time'].numericValue),
      
      // 추가 지표
      speed_index: audits['speed-index'].numericValue / 1000,
      tti: audits['interactive'].numericValue / 1000,
      
      // 상태 판정
      status: getStatus(Math.round(lighthouse.categories.performance.score * 100)),
      
      // 측정 시간
      measurement_time: new Date().toLocaleString('ko-KR'),
      
      // 문제점 및 개선 제안 (추가)
      issues: opportunities.length > 0 ? opportunities.join(' | ') : null,
      suggestions: diagnostics.length > 0 ? diagnostics.join(' | ') : null,
      
      // 에러 없음
      error: null
    };

    console.log(`측정 완료: ${url} - ${result.performance_score}점`);
    return result;

  } catch (error) {
    console.error(`측정 실패: ${url}`, error.message);
    
    // 실패 시 0점 데이터 반환
    return {
      url: url,
      network: network,
      measured_at: new Date().toISOString(),
      performance_score: 0,
      fcp: 0,
      lcp: 0,
      cls: 0,
      tbt: 0,
      speed_index: 0,
      tti: 0,
      status: 'Failed',
      measurement_time: new Date().toLocaleString('ko-KR'),
      error: getErrorMessage(error),
      issues: `측정 실패: ${error.message}`,
      suggestions: '나중에 다시 시도해주세요.'
    };
  }
}

// ==================== 개선 기회 추출 ====================

function extractOpportunities(audits) {
  const opportunities = [];
  
  // 주요 개선 항목들
  const opportunityKeys = [
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
    'uses-long-cache-ttl',
    'dom-size',
    'critical-request-chains',
    'user-timings',
    'bootup-time',
    'mainthread-work-breakdown',
    'font-display',
    'third-party-summary',
    'third-party-facades',
    'largest-contentful-paint-element',
    'layout-shift-elements',
    'long-tasks',
    'non-composited-animations',
    'unsized-images'
  ];

  opportunityKeys.forEach(key => {
    if (audits[key] && audits[key].score !== null && audits[key].score < 1) {
      const audit = audits[key];
      const title = audit.title;
      const description = audit.description || '';
      
      // 저장 가능 시간이나 바이트 수가 있으면 포함
      let detail = '';
      if (audit.details && audit.details.overallSavingsMs) {
        const savingsMs = Math.round(audit.details.overallSavingsMs);
        if (savingsMs > 100) {
          detail = ` (${(savingsMs / 1000).toFixed(1)}초 절약 가능)`;
        }
      } else if (audit.details && audit.details.overallSavingsBytes) {
        const savingsKb = Math.round(audit.details.overallSavingsBytes / 1024);
        if (savingsKb > 10) {
          detail = ` (${savingsKb}KB 절약 가능)`;
        }
      }
      
      opportunities.push(`${title}${detail}`);
    }
  });

  // 상위 5개만 반환
  return opportunities.slice(0, 5);
}

// ==================== 진단 정보 추출 ====================

function extractDiagnostics(audits) {
  const diagnostics = [];
  
  // 진단 항목들
  const diagnosticKeys = [
    'network-requests',
    'network-rtt',
    'network-server-latency',
    'main-thread-tasks',
    'metrics',
    'screenshot-thumbnails',
    'final-screenshot',
    'script-treemap-data'
  ];

  // 주요 개선 제안 생성
  const suggestions = [];

  // LCP 개선
  if (audits['largest-contentful-paint'] && 
      audits['largest-contentful-paint'].numericValue > 2500) {
    suggestions.push('LCP 개선: 이미지 최적화 및 지연 로딩 적용');
  }

  // FCP 개선
  if (audits['first-contentful-paint'] && 
      audits['first-contentful-paint'].numericValue > 1800) {
    suggestions.push('FCP 개선: 렌더링 차단 리소스 제거');
  }

  // TBT 개선
  if (audits['total-blocking-time'] && 
      audits['total-blocking-time'].numericValue > 200) {
    suggestions.push('TBT 개선: JavaScript 실행 시간 단축');
  }

  // CLS 개선
  if (audits['cumulative-layout-shift'] && 
      audits['cumulative-layout-shift'].numericValue > 0.1) {
    suggestions.push('CLS 개선: 이미지/광고에 크기 지정');
  }

  // 이미지 최적화
  if (audits['modern-image-formats'] && audits['modern-image-formats'].score < 1) {
    suggestions.push('WebP 또는 AVIF 포맷 사용');
  }

  // CSS/JS 최적화
  if (audits['unused-css-rules'] && audits['unused-css-rules'].score < 0.5) {
    suggestions.push('사용하지 않는 CSS 제거');
  }

  if (audits['unused-javascript'] && audits['unused-javascript'].score < 0.5) {
    suggestions.push('사용하지 않는 JavaScript 제거');
  }

  // 캐싱
  if (audits['uses-long-cache-ttl'] && audits['uses-long-cache-ttl'].score < 0.5) {
    suggestions.push('정적 자산에 효율적인 캐시 정책 적용');
  }

  return suggestions.length > 0 ? suggestions : ['추가 개선 사항 없음'];
}

// 에러 메시지 정리
function getErrorMessage(error) {
  if (error.response) {
    return `HTTP ${error.response.status} - 다시 시도 필요`;
  } else if (error.code === 'ECONNABORTED') {
    return 'Timeout - 다시 시도 필요';
  } else if (error.code === 'ENOTFOUND') {
    return 'URL을 찾을 수 없음';
  } else {
    return error.message || '알 수 없는 에러';
  }
}

// 성능 상태 판정 함수
function getStatus(score) {
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

// 여러 URL 측정 (순차적으로)
async function measureMultipleUrls(urlList, delayMs = 1000) {
  const results = [];
  
  for (let i = 0; i < urlList.length; i++) {
    const item = urlList[i];
    
    try {
      const result = await measurePageSpeed(item.url, item.network);
      
      // URL 마스터 정보 추가
      result.site_name = item.site_name;
      result.page_detail = item.page_detail;
      result.url_master_id = item.id;
      
      results.push(result);
      
      // 진행 상황 표시
      console.log(`진행: ${i + 1}/${urlList.length}`);
      
      // API 제한 방지를 위한 딜레이
      if (i < urlList.length - 1) {
        await sleep(delayMs);
      }
      
    } catch (error) {
      console.error(`${item.url} 측정 실패:`, error.message);
      results.push({
        url: item.url,
        network: item.network,
        site_name: item.site_name,
        page_detail: item.page_detail,
        error: error.message,
        measured_at: new Date().toISOString()
      });
    }
  }
  
  return results;
}

// 딜레이 함수
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  measurePageSpeed,
  measureMultipleUrls
};