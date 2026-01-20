const fs = require('fs');
const db = require('../src/database');

/**
 * GitHub Actions 로그에서 측정 데이터를 파싱하여 데이터베이스에 저장하는 스크립트
 *
 * 사용법:
 * 1. GitHub Actions 로그를 텍스트 파일로 저장 (예: measurement-log-2026-01-03.txt)
 * 2. node parse-github-logs.js <로그파일경로>
 */

function getKoreaTime() {
  return new Date(Date.now() + (9 * 60 * 60 * 1000));
}

function parseLogFile(logFilePath) {
  console.log(`📄 로그 파일 읽는 중: ${logFilePath}`);

  const logContent = fs.readFileSync(logFilePath, 'utf8');
  const lines = logContent.split('\n');

  const measurements = [];
  let currentUrl = null;
  let currentSiteName = null;
  let currentPageDetail = null;
  let currentNetwork = null;
  let currentMeasuredAt = null;

  // 로그에서 네트워크 타입과 측정 시간 추출
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 네트워크 타입 감지: "네트워크 타입: Mobile" or "네트워크 타입: Desktop"
    if (line.includes('네트워크 타입:') || line.includes('Network type:')) {
      const match = line.match(/(Mobile|Desktop)/);
      if (match) {
        currentNetwork = match[1];
        console.log(`📡 네트워크 타입: ${currentNetwork}`);
      }
    }

    // 측정 시작 시간 감지: "예약된 측정 시작 (한국시간): 2026. 1. 5. 오후 2:39:28"
    if (line.includes('예약된 측정 시작') || line.includes('측정 시작')) {
      const dateMatch = line.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*오후\s*(\d{1,2}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        const [_, year, month, day, hours, minutes, seconds] = dateMatch;
        currentMeasuredAt = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes}:${seconds}.000Z`;
        console.log(`📅 측정 시작 시간: ${currentMeasuredAt}`);
      }
    }
  }

  // 각 URL 측정 결과 파싱
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // URL 측정 시작: "[1/65] 측정 중: https://biocom.kr/"
    const urlMatch = line.match(/\[(\d+)\/\d+\]\s*측정\s*중:\s*(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      currentUrl = urlMatch[2];

      // 다음 줄에서 사이트명과 페이지 정보 추출
      if (i + 1 < lines.length) {
        const siteMatch = lines[i + 1].match(/사이트:\s*(.+)/);
        if (siteMatch) {
          currentSiteName = siteMatch[1].trim();
          if (currentSiteName === '-') currentSiteName = null;
        }
      }
      if (i + 2 < lines.length) {
        const pageMatch = lines[i + 2].match(/페이지:\s*(.+)/);
        if (pageMatch) {
          currentPageDetail = pageMatch[1].trim();
          if (currentPageDetail === '-') currentPageDetail = null;
        }
      }

      continue;
    }

    // 성공 케이스: "✅ 완료: https://biocom.kr/ - 10점 (2026-01-05 02:48:12)"
    const successMatch = line.match(/✅\s*완료:\s*(https?:\/\/[^\s]+)\s*-\s*(\d+)점\s*\(([^)]+)\)/);
    if (successMatch) {
      const url = successMatch[1];
      const score = parseInt(successMatch[2]);
      const measurementTime = successMatch[3];

      // 다음 몇 줄에서 메트릭 정보 추출
      let issues = null;
      let suggestions = null;

      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].includes('문제점:')) {
          const issueMatch = lines[j].match(/문제점:\s*(.+)/);
          if (issueMatch) issues = issueMatch[1].trim();
        }
        if (lines[j].includes('개선안:')) {
          const suggMatch = lines[j].match(/개선안:\s*(.+)/);
          if (suggMatch) suggestions = suggMatch[1].trim();
        }
      }

      // 메트릭 값 파싱 (issues 문자열에서 추출)
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

      let status = 'Good';
      if (score < 90) status = 'Needs Improvement';
      if (score < 50) status = 'Poor';

      measurements.push({
        url: url,
        site_name: currentSiteName,
        page_detail: currentPageDetail,
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

    // 실패 케이스: "✅ 완료: 0점 (Poor)"
    const failMatch = line.match(/✅\s*완료:\s*0점\s*\(Poor\)/);
    if (failMatch && currentUrl) {
      measurements.push({
        url: currentUrl,
        site_name: currentSiteName,
        page_detail: currentPageDetail,
        network: currentNetwork,
        measured_at: currentMeasuredAt,
        performance_score: 0,
        status: 'Poor',
        fcp: null,
        lcp: null,
        tbt: null,
        cls: null,
        speed_index: null,
        tti: null,
        measurement_time: null,
        issues: '측정 실패',
        suggestions: null
      });
    }
  }

  return measurements;
}

function saveMeasurement(result) {
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

async function main() {
  const logFilePath = process.argv[2];

  if (!logFilePath) {
    console.error('❌ 사용법: node parse-github-logs.js <로그파일경로>');
    process.exit(1);
  }

  if (!fs.existsSync(logFilePath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${logFilePath}`);
    process.exit(1);
  }

  console.log('🚀 GitHub Actions 로그 파싱 시작\n');

  const measurements = parseLogFile(logFilePath);

  console.log(`\n📊 파싱된 측정 결과: ${measurements.length}개\n`);

  if (measurements.length === 0) {
    console.log('⚠️  파싱된 데이터가 없습니다. 로그 형식을 확인해주세요.');
    process.exit(0);
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
      await saveMeasurement(measurement);
      saved++;
      console.log(`✅ [${saved}/${measurements.length}] ${measurement.url} - ${measurement.performance_score}점`);
    } catch (error) {
      failed++;
      console.error(`❌ 저장 실패: ${measurement.url}`, error.message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ 복구 완료: 성공 ${saved}개, 실패 ${failed}개 / 전체 ${measurements.length}개`);
  console.log('='.repeat(80) + '\n');

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

module.exports = { parseLogFile, saveMeasurement };
