const cron = require('node-cron');
const db = require('./database');

// measurePageSpeed를 직접 import
const pagespeed = require('./pagespeed');
const measurePageSpeed = pagespeed.measurePageSpeed;

let isRunning = false;
let scheduledTask = null;

// 측정 실행 함수
async function runScheduledMeasurement() {
  if (isRunning) {
    console.log('⏸️  이미 측정이 진행 중입니다. 건너뜁니다.');
    return;
  }

  console.log('\n🕐 예약된 측정 시작:', new Date().toLocaleString('ko-KR'));
  isRunning = true;

  try {
    // URL 목록 가져오기
    const urls = await getActiveUrls();

    if (urls.length === 0) {
      console.log('⚠️  측정할 URL이 없습니다.');
      isRunning = false;
      return;
    }

    console.log(`📊 ${urls.length}개 URL 측정 시작`);

    let successCount = 0;
    let failCount = 0;

    // 각 URL 측정
    for (let i = 0; i < urls.length; i++) {
      const urlItem = urls[i];

      try {
        console.log(`[${i + 1}/${urls.length}] 측정 중: ${urlItem.url} (${urlItem.network})`);

        const result = await measurePageSpeed(urlItem.url, urlItem.network);

        // DB 저장
        await saveResult({
          ...result,
          url_master_id: urlItem.id,
          site_name: urlItem.site_name,
          page_detail: urlItem.page_detail
        });

        successCount++;
        console.log(`✅ 완료: ${urlItem.url} - ${result.performance_score}점`);

      } catch (error) {
        failCount++;
        console.error(`❌ 실패: ${urlItem.url} - ${error.message}`);
      }

      // API 제한 방지 딜레이 (1초)
      if (i < urls.length - 1) {
        await sleep(1000);
      }
    }

    console.log(`\n🎉 측정 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    console.log(`⏰ 다음 측정: ${getNextRunTime()}\n`);

  } catch (error) {
    console.error('❌ 스케줄 측정 중 오류:', error.message);
  } finally {
    isRunning = false;
  }
}

// DB에서 활성 URL 가져오기
function getActiveUrls() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM url_master WHERE is_active = 1', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// 측정 결과 저장
function saveResult(result) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO measurements (
        url_master_id, measured_at, url, site_name, page_detail, network,
        performance_score, status, fcp, lcp, tbt, speed_index, cls, tti,
        measurement_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      result.url_master_id,
      result.measured_at,
      result.url,
      result.site_name,
      result.page_detail,
      result.network,
      result.performance_score,
      result.status,
      result.fcp,
      result.lcp,
      result.tbt,
      result.speed_index,
      result.cls,
      result.tti,
      result.measurement_time
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// 딜레이 함수
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 다음 실행 시간 계산
function getNextRunTime() {
  if (!scheduledTask) return '스케줄 없음';
  
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(2, 0, 0, 0);
  
  return next.toLocaleString('ko-KR');
}

// 스케줄 시작
function startScheduler(cronExpression = '0 2 * * *') {
  if (scheduledTask) {
    console.log('⚠️  이미 스케줄러가 실행 중입니다.');
    return;
  }

  // cron 표현식: '0 2 * * *' = 매일 새벽 2시
  // 분 시 일 월 요일
  scheduledTask = cron.schedule(cronExpression, runScheduledMeasurement, {
    timezone: 'Asia/Seoul'
  });

  console.log('✅ 스케줄러 시작됨');
  console.log(`⏰ 실행 시간: ${cronExpression} (매일 새벽 2시)`);
  console.log(`📅 다음 실행: ${getNextRunTime()}\n`);
}

// 스케줄 중지
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('🛑 스케줄러 중지됨');
  }
}

// 즉시 실행 (테스트용)
function runNow() {
  console.log('🚀 즉시 측정 실행...');
  runScheduledMeasurement();
}

module.exports = {
  startScheduler,
  stopScheduler,
  runNow,
  runScheduledMeasurement
};