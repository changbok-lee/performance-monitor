const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../database/performance.db');
const LOG_FILE = 'C:\\Users\\miku\\Downloads\\0_measure.txt';

function parseLogFile(logFilePath) {
  console.log(`\n📄 로그 파일 읽는 중: ${logFilePath}`);

  const logContent = fs.readFileSync(logFilePath, 'utf8');
  const lines = logContent.split('\n');

  const measurements = [];

  // 측정 시작 시간 추출 (한국시간)
  let measuredAt = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('📊 예약된 측정 시작') || lines[i].includes('🚀 Starting')) {
      // 다음 날짜 찾기: "2026. 1. 13. 오전 2:56:38" 형식
      const dateMatch = lines[i].match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*오(?:전|후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        const [_, year, month, day, hours, minutes, seconds] = dateMatch;
        const isPM = lines[i].includes('오후');
        let hour24 = parseInt(hours);
        if (isPM && hour24 !== 12) hour24 += 12;
        if (!isPM && hour24 === 12) hour24 = 0;

        // 한국시간을 UTC로 변환 (한국시간 - 9시간 = UTC)
        const koreaTime = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour24).padStart(2, '0')}:${minutes}:${seconds}+09:00`);
        measuredAt = koreaTime.toISOString();
        console.log(`📅 측정 시간 (한국): ${year}-${month}-${day} ${hour24}:${minutes}:${seconds}`);
        console.log(`📅 측정 시간 (UTC): ${measuredAt}`);
        break;
      }
    }
  }

  // 기본값: 1월 13일 Desktop = 2026-01-12T17:56:00.000Z (한국시간 2026-01-13 02:56:00)
  if (!measuredAt) {
    measuredAt = '2026-01-12T17:56:00.000Z';
    console.log(`⚠️  측정 시간 자동 설정: ${measuredAt}`);
  }

  // 각 URL 측정 결과 파싱
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 측정 시작: "[1/65] 측정 중: https://biocom.kr/"
    if (line.match(/\[\d+\/\d+\]\s*측정 중:/)) {
      const urlMatch = line.match(/측정 중:\s*(https?:\/\/[^\s]+)/);
      if (!urlMatch) continue;

      const url = urlMatch[1];

      // 다음 몇 줄에서 사이트명, 페이지 상세 찾기
      let siteName = null;
      let pageDetail = null;

      // 다음 5줄 확인
      for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
        if (lines[k].includes('사이트:')) {
          siteName = lines[k].split('사이트:')[1].trim();
        }
        if (lines[k].includes('페이지:')) {
          pageDetail = lines[k].split('페이지:')[1].trim();
        }
      }

      // 결과 찾기: "✅ 완료: ... - 10점"
      let score = null;
      let status = null;
      let fcp = null;
      let lcp = null;
      let tbt = null;
      let cls = null;
      let speed_index = null;
      let tti = null;
      let issues = null;
      let suggestions = null;

      for (let j = i; j < Math.min(i + 200, lines.length); j++) {
        const nextLine = lines[j];

        // 결과 찾기: "✅ 완료: https://biocom.kr/all_supplements - 10점"
        if (nextLine.includes('✅ 완료:') && nextLine.includes(url)) {
          const scoreMatch = nextLine.match(/- (\d+)점/);
          if (scoreMatch) {
            score = parseInt(scoreMatch[1]);
            if (score >= 90) status = 'Good';
            else if (score >= 50) status = 'Needs Improvement';
            else status = 'Poor';
          }

          // 다음 줄들에서 문제점과 개선 제안 찾기
          if (j + 1 < lines.length && lines[j + 1].includes('⚠️  문제점:')) {
            issues = lines[j + 1].split('⚠️  문제점:')[1].trim();

            // 메트릭 추출
            const fcpMatch = issues.match(/FCP\s*느림\s*\(([0-9.]+)초\)/);
            if (fcpMatch) fcp = parseFloat(fcpMatch[1]);

            const lcpMatch = issues.match(/LCP\s*느림\s*\(([0-9.]+)초\)/);
            if (lcpMatch) lcp = parseFloat(lcpMatch[1]);

            const tbtMatch = issues.match(/TBT\s*높음\s*\((\d+)ms\)/);
            if (tbtMatch) tbt = parseInt(tbtMatch[1]);

            const clsMatch = issues.match(/CLS\s*높음\s*\(([0-9.]+)\)/);
            if (clsMatch) cls = parseFloat(clsMatch[1]);

            const siMatch = issues.match(/Speed Index\s*느림\s*\(([0-9.]+)초\)/);
            if (siMatch) speed_index = parseFloat(siMatch[1]);

            const ttiMatch = issues.match(/TTI\s*느림\s*\(([0-9.]+)초\)/);
            if (ttiMatch) tti = parseFloat(ttiMatch[1]);
          }

          if (j + 2 < lines.length && lines[j + 2].includes('💡 개선안:')) {
            suggestions = lines[j + 2].split('💡 개선안:')[1].trim();
          }

          break;
        }

        // 실패한 경우: "❌ 측정 실패:"
        if (nextLine.includes('❌ 측정 실패:') && nextLine.includes(url)) {
          score = 0;
          status = 'Failed';
          break;
        }

        // 다음 URL 측정 시작하면 중단
        if (j > i + 10 && nextLine.match(/\[\d+\/\d+\]\s*측정 중:/)) {
          break;
        }
      }

      if (score !== null) {
        measurements.push({
          url,
          site_name: siteName,
          page_detail: pageDetail,
          network: 'Desktop',
          measured_at: measuredAt,
          performance_score: score,
          status,
          fcp,
          lcp,
          tbt,
          cls,
          speed_index,
          tti,
          measurement_time: null,
          issues,
          suggestions
        });
      }
    }
  }

  console.log(`✅ 파싱 완료: ${measurements.length}개 측정 결과`);
  return measurements;
}

function saveMeasurement(db, result) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO measurements (
        url, site_name, page_detail, network,
        measured_at, performance_score, status,
        fcp, lcp, tbt, cls, speed_index, tti,
        measurement_time, issues, suggestions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      result.url,
      result.site_name,
      result.page_detail,
      result.network,
      result.measured_at,
      result.performance_score,
      result.status,
      result.fcp,
      result.lcp,
      result.tbt,
      result.cls,
      result.speed_index,
      result.tti,
      result.measurement_time,
      result.issues,
      result.suggestions,
      (err) => {
        stmt.finalize();
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function main() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`❌ 로그 파일을 찾을 수 없습니다: ${LOG_FILE}`);
    process.exit(1);
  }

  console.log('🚀 1월 13일 Desktop 로그 복구 시작\n');

  const db = new sqlite3.Database(DB_PATH);

  // 기존 데이터 확인
  const existingCount = await new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as cnt FROM measurements
       WHERE date(datetime(measured_at, '+9 hours')) = '2026-01-13'
       AND network = 'Desktop'`,
      (err, row) => {
        if (err) reject(err);
        else resolve(row.cnt);
      }
    );
  });

  console.log(`📊 기존 1월 13일 Desktop 데이터: ${existingCount}개\n`);

  if (existingCount > 0) {
    console.log('⚠️  이미 Desktop 데이터가 있습니다. 계속하시겠습니까?');
    console.log('   중복을 방지하려면 Ctrl+C를 눌러 중단하세요.');
    console.log('   5초 후 자동으로 진행합니다...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const measurements = parseLogFile(LOG_FILE);

  if (measurements.length === 0) {
    console.log('⚠️  파싱된 데이터 없음\n');
    db.close();
    return;
  }

  console.log(`\n💾 DB 저장 중...`);

  let totalSaved = 0;
  let totalFailed = 0;

  for (const m of measurements) {
    try {
      await saveMeasurement(db, m);
      totalSaved++;
      if (totalSaved <= 3 || totalSaved % 10 === 0) {
        console.log(`✅ [${totalSaved}] ${m.url} - ${m.performance_score}점`);
      }
    } catch (error) {
      totalFailed++;
      console.error(`❌ 저장 실패: ${m.url}`, error.message);
    }
  }

  db.close();

  console.log(`\n${'='.repeat(80)}`);
  console.log('🎉 복구 완료!');
  console.log('='.repeat(80));
  console.log(`✅ 성공: ${totalSaved}개`);
  console.log(`❌ 실패: ${totalFailed}개`);
  console.log('='.repeat(80));
}

main().catch(console.error);
