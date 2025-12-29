const fs = require('fs');
const csv = require('csv-parser');
const db = require('./src/database');

const csvFilePath = './import-data.csv';

async function importCSV() {
  console.log('\n📥 CSV 데이터 import 시작...\n');
  
  const results = [];
  
  // CSV 파일 읽기
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (row) => {
      // 엑셀 컬럼명에 맞춰 매핑
      const data = {
        measured_at: convertExcelDate(row['No']), // 엑셀 날짜 변환
        url: row['URL'],
        site_name: row['사이트명'],
        page_detail: row['페이지상세'],
        network: 'Mobile', // 모바일 4G
        performance_score: parseInt(row['Performance Score']),
        status: row['상태'],
        fcp: parseFloat(row['FCP (초)']),
        lcp: parseFloat(row['LCP (초)']),
        tbt: parseInt(row['TBT (ms)']),
        speed_index: parseFloat(row['Speed Index']),
        cls: 0, // 엑셀에 없으면 0
        tti: 0,
        issues: row['주요 문제점'] || null,
        suggestions: row['개선 제안'] || null
      };
      
      results.push(data);
    })
    .on('end', async () => {
      console.log(`📋 총 ${results.length}개 데이터 발견\n`);
      
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
          console.log(`✅ [${successCount}/${results.length}] ${data.url}`);
          
        } catch (error) {
          errorCount++;
          console.error(`❌ 실패: ${data.url}`, error.message);
        }
      }
      
      console.log(`\n🎉 완료: 성공 ${successCount}개, 실패 ${errorCount}개`);
      db.close();
      process.exit(0);
    });
}

// 엑셀 날짜 변환 (2025. 12. 15 오전 10:34:11 → ISO 형식)
function convertExcelDate(dateStr) {
  // "2025. 12. 15 오전 10:34:11" 형식
  const match = dateStr.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
  
  if (!match) return new Date().toISOString();
  
  const [_, year, month, day, ampm, hour, min, sec] = match;
  let h = parseInt(hour);
  
  if (ampm === '오후' && h !== 12) h += 12;
  if (ampm === '오전' && h === 12) h = 0;
  
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    h,
    parseInt(min),
    parseInt(sec)
  );
  
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
          // 없으면 생성
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