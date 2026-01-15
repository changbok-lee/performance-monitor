require('dotenv').config();
const { measurePageSpeed } = require('./src/pagespeed');
const fs = require('fs');

// ==================== Supabase 설정 ====================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_KEY 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

async function supabaseRequest(endpoint, options = {}) {
  const { method = 'GET', body, select, filters = '' } = options;

  let url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  if (select) url += `?select=${select}`;
  if (filters) url += (select ? '&' : '?') + filters;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase 오류: ${response.status} - ${error}`);
  }

  if (method === 'POST' || method === 'GET') {
    return await response.json();
  }
  return { success: true };
}

// ==================== 한국시간 유틸리티 ====================

function getKoreaTime() {
  return new Date(Date.now() + (9 * 60 * 60 * 1000));
}

function getKoreaTimeString() {
  const koreaTime = getKoreaTime();
  const year = koreaTime.getUTCFullYear();
  const month = koreaTime.getUTCMonth() + 1;
  const day = koreaTime.getUTCDate();
  const hours = koreaTime.getUTCHours();
  const minutes = String(koreaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(koreaTime.getUTCSeconds()).padStart(2, '0');

  return `${year}. ${month}. ${day}. 오후 ${hours}:${minutes}:${seconds}`;
}

// ==================== 설정 ====================

const NETWORK_TYPE = process.env.NETWORK_TYPE || 'Mobile';
const apiKey = process.env.PAGESPEED_API_KEY;

if (!apiKey) {
  console.error('❌ PAGESPEED_API_KEY 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

// ==================== URL 목록 로드 ====================

function loadUrls() {
  try {
    const data = fs.readFileSync('./urls.json', 'utf8');
    const urls = JSON.parse(data);
    console.log(`✅ ${urls.length}개 URL 로드 완료`);
    return urls;
  } catch (error) {
    console.error('❌ urls.json 파일을 읽을 수 없습니다:', error.message);
    process.exit(1);
  }
}

// ==================== 측정 결과 저장 (Supabase) ====================

async function saveMeasurement(result) {
  await supabaseRequest('measurements', {
    method: 'POST',
    body: {
      url: result.url,
      site_name: result.site_name || null,
      page_detail: result.page_detail || null,
      network: result.network,
      measured_at: result.measured_at,
      performance_score: result.performance_score,
      status: result.status,
      fcp: result.fcp,
      lcp: result.lcp,
      tbt: result.tbt,
      cls: result.cls,
      speed_index: result.speed_index,
      tti: result.tti,
      measurement_time: result.measurement_time,
      issues: result.issues,
      suggestions: result.suggestions
    }
  });
}

// ==================== 진행 상황 저장 ====================

let measurementStatus = {
  isRunning: false,
  completed: 0,
  failed: 0,
  total: 0,
  startTime: null
};

function updateStatus(completed, failed, total) {
  measurementStatus.completed = completed;
  measurementStatus.failed = failed;
  measurementStatus.total = total;
}

function getStatus() {
  return measurementStatus;
}

// ==================== 메인 측정 함수 ====================

async function runMeasurements() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 예약된 측정 시작 (한국시간): ${getKoreaTimeString()}`);
  console.log(`📡 네트워크 타입: ${NETWORK_TYPE}`);
  console.log(`💾 저장소: Supabase`);
  console.log(`${'='.repeat(80)}\n`);

  measurementStatus.isRunning = true;
  measurementStatus.startTime = getKoreaTime();
  measurementStatus.completed = 0;
  measurementStatus.failed = 0;

  const urls = loadUrls();
  measurementStatus.total = urls.length;

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i++) {
    const urlData = urls[i];
    const url = urlData.url;

    console.log(`\n[${i + 1}/${urls.length}] 측정 중: ${url}`);
    console.log(`   사이트: ${urlData.site_name || '-'}`);
    console.log(`   페이지: ${urlData.page_detail || '-'}`);

    try {
      const result = await measurePageSpeed(url, NETWORK_TYPE);

      // URL 정보 추가
      result.site_name = urlData.site_name;
      result.page_detail = urlData.page_detail;

      await saveMeasurement(result);

      completed++;
      updateStatus(completed, failed, urls.length);

      console.log(`   ✅ 완료: ${result.performance_score}점 (${result.status})`);

    } catch (error) {
      failed++;
      updateStatus(completed, failed, urls.length);

      console.error(`   ❌ 실패: ${error.message}`);

      // 실패한 URL도 0점으로 DB에 저장 (대시보드에 표시되도록)
      try {
        const failedResult = {
          url: url,
          site_name: urlData.site_name,
          page_detail: urlData.page_detail,
          network: NETWORK_TYPE,
          measured_at: new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString(),
          performance_score: 0,
          status: 'Poor',
          fcp: null,
          lcp: null,
          tbt: null,
          cls: null,
          speed_index: null,
          tti: null,
          measurement_time: getKoreaTimeString(),
          issues: `측정 실패: ${error.message}`,
          suggestions: null
        };

        await saveMeasurement(failedResult);
        console.log(`   💾 실패 기록 저장 완료 (0점)`);
      } catch (saveError) {
        console.error(`   ⚠️ 실패 기록 저장 실패: ${saveError.message}`);
      }
    }

    // 진행률 표시
    const progress = ((completed + failed) / urls.length * 100).toFixed(1);
    console.log(`   진행률: ${progress}% (성공: ${completed}, 실패: ${failed})`);

    // API 호출 제한 방지 (0.5초 대기)
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  measurementStatus.isRunning = false;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ 측정 완료 (한국시간): ${getKoreaTimeString()}`);
  console.log(`📊 결과: 성공 ${completed}개, 실패 ${failed}개 / 전체 ${urls.length}개`);
  console.log(`💾 Supabase에 저장 완료`);

  if (failed > 0) {
    console.log(`⚠️  일부 URL 측정 실패 (${failed}개) - 실패한 URL은 대시보드에서 확인 가능`);
  }

  console.log(`${'='.repeat(80)}\n`);

  // ✅ 일부 실패가 있어도 성공으로 처리 (최소 1개 이상 성공하면 OK)
  // 전체 실패만 exit code 1
  if (completed === 0 && failed > 0) {
    console.error('❌ 모든 URL 측정 실패 - 스케줄링 실패 처리');
    process.exit(1);
  }

  console.log('✅ 스케줄링 성공 완료');
  process.exit(0);
}

// ==================== 에러 처리 ====================

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  measurementStatus.isRunning = false;
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n⚠️ 측정 중단됨');
  measurementStatus.isRunning = false;
  process.exit(0);
});

// ==================== 실행 ====================

if (require.main === module) {
  runMeasurements().catch(error => {
    console.error('❌ 측정 중 오류 발생:', error);
    measurementStatus.isRunning = false;
    process.exit(1);
  });
}

// ==================== Export (API용) ====================

module.exports = {
  runMeasurements,
  getStatus
};
