const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

/**
 * GitHub Actions 로그를 파싱하여 측정 데이터를 DB에 저장
 */

const DB_PATH = path.join(__dirname, '../database/performance.db');

function parseLogFile(logFilePath) {
  console.log(`\n📄 로그 파일 읽는 중: ${logFilePath}`);

  const logContent = fs.readFileSync(logFilePath, 'utf8');
  const lines = logContent.split('\n');

  const measurements = [];
  let currentNetwork = null;
  let currentMeasuredAt = null;

  // 네트워크 타입과 측정 시작 시간 추출
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 네트워크 타입: "📡 네트워크 타입: Mobile"
    if (line.includes('📡 네트워크 타입:')) {
      const match = line.match(/(Mobile|Desktop)/);
      if (match) {
        currentNetwork = match[1];
        console.log(`📡 네트워크 타입: ${currentNetwork}`);
      }
    }

    // 측정 시작 시간: "📊 예약된 측정 시작 (한국시간): 2026. 1. 3. 오후 1:22:08"
    if (line.includes('📊 예약된 측정 시작')) {
      const dateMatch = line.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*오(?:전|후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        const [_, year, month, day, hours, minutes, seconds] = dateMatch;
        const isPM = line.includes('오후');
        let hour24 = parseInt(hours);
        if (isPM && hour24 !== 12) hour24 += 12;
        if (!isPM && hour24 === 12) hour24 = 0;

        currentMeasuredAt = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour24).padStart(2, '0')}:${minutes}:${seconds}.000Z`;
        console.log(`📅 측정 시작 시간: ${currentMeasuredAt}`);
      }
    }

    // 각 URL 측정 결과 파싱
    // "[1/65] 측정 중: https://biocom.kr/"
    const urlStartMatch = line.match(/\[(\d+)\/\d+\]\s*측정\s*중:\s*(https?:\/\/[^\s]+)/);
    if (urlStartMatch) {
      const url = urlStartMatch[2];
      let siteName = null;
      let pageDetail = null;
      let score = null;
      let measurementTime = null;
      let issues = null;
      let suggestions = null;
      let status = 'Poor';

      // 사이트명, 페이지 정보 (다음 2줄)
      if (i + 1 < lines.length && lines[i + 1].includes('사이트:')) {
        const siteMatch = lines[i + 1].match(/사이트:\s*(.+)/);
        if (siteMatch) {
          siteName = siteMatch[1].trim();
          if (siteName === '-') siteName = null;
        }
      }
      if (i + 2 < lines.length && lines[i + 2].includes('페이지:')) {
        const pageMatch = lines[i + 2].match(/페이지:\s*(.+)/);
        if (pageMatch) {
          pageDetail = pageMatch[1].trim();
          if (pageDetail === '-') pageDetail = null;
        }
      }

      // 완료 정보 찾기 (다음 10줄 내에서)
      for (let j = i + 3; j < Math.min(i + 15, lines.length); j++) {
        const completeLine = lines[j];

        // "✅ 완료: https://biocom.kr/ - 36점 (2026-01-03 01:22:49)"
        const completeMatch = completeLine.match(/✅\s*완료:\s*https?:\/\/[^\s]+\s*-\s*(\d+)점\s*\(([^)]+)\)/);
        if (completeMatch) {
          score = parseInt(completeMatch[1]);
          measurementTime = completeMatch[2];

          if (score >= 90) status = 'Good';
          else if (score >= 50) status = 'Needs Improvement';
          else status = 'Poor';
        }

        // "⚠️  문제점: LCP 느림 (59.33초) ..."
        if (completeLine.includes('⚠️  문제점:') || completeLine.includes('문제점:')) {
          const issueMatch = completeLine.match(/문제점:\s*(.+)/);
          if (issueMatch) {
            issues = issueMatch[1].trim();
            // 줄임표 제거
            issues = issues.replace(/\.\.\.$/, '');
          }
        }

        // "💡 개선안: ..."
        if (completeLine.includes('💡 개선안:') || completeLine.includes('개선안:')) {
          const suggMatch = completeLine.match(/개선안:\s*(.+)/);
          if (suggMatch) {
            suggestions = suggMatch[1].trim();
            suggestions = suggestions.replace(/\.\.\.$/, '');
          }
        }

        // 두 번째 ✅ 완료가 나오면 종료
        if (j > i + 3 && completeLine.includes('✅ 완료:') && completeLine.includes('점 (Poor|Needs Improvement|Good)')) {
          break;
        }
      }

      // 메트릭 값 파싱 (issues 문자열에서)
      let fcp = null, lcp = null, tbt = null, cls = null, speed_index = null, tti = null;

      if (issues) {
        const fcpMatch = issues.match(/FCP\s*느림\s*\(([0-9.]+)초\)/);
        if (fcpMatch) fcp = parseFloat(fcpMatch[1]);

        const lcpMatch = issues.match(/LCP\s*느림\s*\(([0-9.]+)초\)/);
        if (lcpMatch) lcp = parseFloat(lcpMatch[1]);

        const tbtMatch = issues.match(/TBT\s*높음\s*\(([0-9.]+)ms\)/);
        if (tbtMatch) tbt = parseFloat(tbtMatch[1]);

        const clsMatch = issues.match(/CLS\s*높음\s*\(([0-9.]+)\)/);
        if (clsMatch) cls = parseFloat(clsMatch[1]);

        const siMatch = issues.match(/Speed Index\s*느림\s*\(([0-9.]+)초\)/);
        if (siMatch) speed_index = parseFloat(siMatch[1]);

        const ttiMatch = issues.match(/TTI\s*느림\s*\(([0-9.]+)초\)/);
        if (ttiMatch) tti = parseFloat(ttiMatch[1]);
      }

      if (score !== null) {
        measurements.push({
          url: url,
          site_name: siteName,
          page_detail: pageDetail,
          network: currentNetwork,
          measured_at: currentMeasuredAt,
          performance_score: score,
          status: status,
          fcp: fcp,
          lcp: lcp,
          tbt: tbt,
          cls: cls,
          speed_index: speed_index,
          tti: tti,
          measurement_time: measurementTime,
          issues: issues,
          suggestions: suggestions
        });
      }
    }
  }

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
      result.site_name || null,
      result.page_detail || null,
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
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

async function processLogFile(db, logFilePath) {
  const measurements = parseLogFile(logFilePath);

  console.log(`\n📊 파싱된 측정 결과: ${measurements.length}개\n`);

  if (measurements.length === 0) {
    console.log('⚠️  파싱된 데이터가 없습니다.');
    return { saved: 0, failed: 0 };
  }

  // 미리보기 (처음 3개)
  console.log('📋 데이터 미리보기:');
  measurements.slice(0, 3).forEach((m, i) => {
    console.log(`\n[${i + 1}] ${m.url}`);
    console.log(`   점수: ${m.performance_score}점 (${m.status})`);
    console.log(`   네트워크: ${m.network}`);
    console.log(`   측정 시간: ${m.measurement_time || m.measured_at}`);
  });

  console.log('\n\n💾 데이터베이스에 저장 중...\n');

  let saved = 0;
  let failed = 0;

  for (const measurement of measurements) {
    try {
      await saveMeasurement(db, measurement);
      saved++;
      console.log(`✅ [${saved}/${measurements.length}] ${measurement.url} - ${measurement.performance_score}점`);
    } catch (error) {
      failed++;
      console.error(`❌ 저장 실패: ${measurement.url}`, error.message);
    }
  }

  return { saved, failed, total: measurements.length };
}

async function main() {
  const logsDir = process.argv[2] || 'C:\\Users\\miku\\Downloads\\logs-recovery';

  if (!fs.existsSync(logsDir)) {
    console.error(`❌ 디렉토리를 찾을 수 없습니다: ${logsDir}`);
    process.exit(1);
  }

  console.log('🚀 GitHub Actions 로그 복구 시작\n');
  console.log(`📂 로그 디렉토리: ${logsDir}\n`);

  const db = new sqlite3.Database(DB_PATH);

  // 날짜와 네트워크 조합
  const combinations = [
    { date: '2026-01-03', network: 'mobile' },
    { date: '2026-01-03', network: 'desktop' },
    { date: '2026-01-04', network: 'mobile' },
    { date: '2026-01-04', network: 'desktop' },
    { date: '2026-01-05', network: 'mobile' },
    { date: '2026-01-05', network: 'desktop' }
  ];

  let totalSaved = 0;
  let totalFailed = 0;
  let totalMeasurements = 0;

  for (const { date, network } of combinations) {
    const logFilePath = path.join(logsDir, `${date}-${network}`, '0_measure.txt');

    if (!fs.existsSync(logFilePath)) {
      console.log(`⚠️  파일을 찾을 수 없습니다: ${logFilePath}`);
      continue;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📅 처리 중: ${date} - ${network.toUpperCase()}`);
    console.log(`${'='.repeat(80)}`);

    const result = await processLogFile(db, logFilePath);
    totalSaved += result.saved;
    totalFailed += result.failed;
    totalMeasurements += result.total;

    console.log(`\n✅ ${date} ${network}: 성공 ${result.saved}개, 실패 ${result.failed}개`);
  }

  console.log('\n\n' + '='.repeat(80));
  console.log(`🎉 전체 복구 완료`);
  console.log(`='.repeat(80)}`);
  console.log(`📊 총 결과: 성공 ${totalSaved}개, 실패 ${totalFailed}개 / 전체 ${totalMeasurements}개`);
  console.log(`='.repeat(80)}\n`);

  db.close((err) => {
    if (err) {
      console.error('DB 종료 중 오류:', err.message);
    } else {
      console.log('✅ DB 연결 종료');
    }
  });
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = { parseLogFile, saveMeasurement, processLogFile };
