const fs = require('fs');
const csv = require('csv-parser');
const db = require('./src/database');

const csvFilePath = './import-data.csv';

async function importCSV() {
  console.log('\n📥 CSV 데이터 import 시작...\n');
  
  const results = [];
  let rowNum = 0;
  
  // CSV 파일 읽기
  fs.createReadStream(csvFilePath, { encoding: 'utf8' })
    .pipe(csv())
    .on('headers', (headers) => {
      console.log('📋 CSV 헤더:', headers);
      console.log('');
    })
    .on('data', (row) => {
      rowNum++;
      
      try {
        // 첫 번째 row 디버깅
        if (rowNum === 1) {
          console.log('🔍 첫 번째 row:');
          Object.keys(row).forEach(key => {
            console.log(`  "${key}": "${row[key]}"`);
          });
          console.log('');
        }
        
        // 측정일시 컬럼 읽기
        const dateValue = row['측정일시'] || '';
        
        if (!dateValue) {
          console.warn(`⚠️  Row ${rowNum}: 측정일시 없음, 스킵`);
          return;
        }
        
        console.log(`📅 Row ${rowNum} 날짜: "${dateValue}"`);
        
        const data = {
          measured_at: convertExcelDate(dateValue),
          url: row['URL'] || '',
          site_name: row['사이트명'] || '',
          page_detail: row['페이지상세'] || '',
          network: 'Mobile',
          performance_score: parseInt(row['Performance Score'] || 0),
          status: row['상태'] || 'Unknown',
          fcp: parseFloat(row['FCP(초)'] || 0),
          lcp: parseFloat(row['LCP(초)'] || 0),
          tbt: parseInt(row['TBT(ms)'] || 0),
          speed_index: parseFloat(row['Speed Index'] || 0),
          cls: 0,
          tti: 0,
          issues: row['주요문제점'] || null,
          suggestions: row['개선제안'] || null
        };
        
        console.log(`  → 변환: ${data.measured_at}`);
        
        // URL 필수 체크
        if (!data.url) {
          console.warn(`⚠️  Row ${rowNum}: URL 없음, 스킵`);
          return;
        }
        
        results.push(data);
        
      } catch (error) {
        console.error(`❌ Row ${rowNum} 파싱 실패:`, error.message);
      }
    })
    .on('end', async () => {
      console.log(`\n📋 총 ${results.length}개 데이터 발견\n`);
      
      if (results.length === 0) {
        console.log('❌ import할 데이터가 없습니다.');
        db.close();
        process.exit(1);
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const data of results) {
        try {
          // URL Master에서 url_master_id 찾기
          const urlMaster = await findOrCreateUrlMaster(data);
          
          // measurements 테이블에 저장
          await saveMeasurement({
            ...data,
            url_master_id: urlMaster.id,
            measurement_time: new Date(data.measured_at).toLocaleString('ko-KR')
          });
          
          successCount++;
          console.log(`✅ [${successCount}/${results.length}] ${data.url.substring(0, 50)} (${data.measured_at})`);
          
        } catch (error) {
          errorCount++;
          console.error(`❌ 실패: ${data.url}`, error.message);
        }
      }
      
      console.log(`\n🎉 완료: 성공 ${successCount}개, 실패 ${errorCount}개`);
      db.close();
      process.exit(0);
    })
    .on('error', (error) => {
      console.error('❌ CSV 읽기 실패:', error.message);
      db.close();
      process.exit(1);
    });
}

// 엑셀 날짜 변환
function convertExcelDate(dateStr) {
  if (!dateStr) {
    console.warn('⚠️  날짜 없음, 현재 시간 사용');
    return new Date().toISOString();
  }
  
  // "2025. 12. 19 오전 11:40:32" 형식
  const match = dateStr.match(/(\d{4})[.\s]*(\d{1,2})[.\s]*(\d{1,2})\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
  
  if (!match) {
    console.warn(`⚠️  날짜 형식 불일치: "${dateStr}", 현재 시간 사용`);
    return new Date().toISOString();
  }
  
  const [_, year, month, day, ampm, hour, min, sec] = match;
  let h = parseInt(hour);
  
  // 오전/오후 변환
  if (ampm === '오후' && h !== 12) {
    h += 12;
  } else if (ampm === '오전' && h === 12) {
    h = 0;
  }
  
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    h,
    parseInt(min),
    parseInt(sec)
  );
  
  console.log(`    변환 상세: ${year}-${month}-${day} ${ampm} ${hour}:${min}:${sec} → ${h}시 → ${date.toISOString()}`);
  
  return date.toISOString();
}

// URL Master 찾기 또는 생성
function findOrCreateUrlMaster(data) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM url_master WHERE url = ? AND network = ?',
      [data.url, data.network],
      (err, row) => {
        if (err) return reject(err);
        
        if (row) {
          resolve(row);
        } else {
          db.run(
            'INSERT INTO url_master (url, site_name, page_detail, network) VALUES (?, ?, ?, ?)',
            [data.url, data.site_name, data.page_detail, data.network],
            function(err) {
              if (err) return reject(err);
              resolve({ id: this.lastID });
            }
          );
        }
      }
    );
  });
}

// Measurement 저장
function saveMeasurement(data) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO measurements (
        url_master_id, measured_at, url, site_name, page_detail, network,
        performance_score, status, fcp, lcp, tbt, speed_index, cls, tti,
        measurement_time, issues, suggestions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.url_master_id,
      data.measured_at,
      data.url,
      data.site_name,
      data.page_detail,
      data.network,
      data.performance_score,
      data.status,
      data.fcp,
      data.lcp,
      data.tbt,
      data.speed_index,
      data.cls,
      data.tti,
      data.measurement_time,
      data.issues,
      data.suggestions
    ], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// 실행
importCSV();