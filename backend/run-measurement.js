require('dotenv').config();
const db = require('./src/database');
const { measurePageSpeed } = require('./src/pagespeed');

// 환경변수로 네트워크 타입 받기 (GitHub Actions용)
const NETWORK_TYPE = process.env.NETWORK_TYPE;

async function measureAndSave(urls) {
  console.log(`\n📊 ${urls.length}개 URL 측정 시작`);
  
  let completed = 0;
  let failed = 0;
  
  for (let i = 0; i < urls.length; i++) {
    const urlItem = urls[i];
    
    try {
      console.log(`\n[${i + 1}/${urls.length}] 측정 중: ${urlItem.url} (${urlItem.network})`);
      
      const result = await measurePageSpeed(urlItem.url, urlItem.network);
      
      result.url_master_id = urlItem.id;
      result.site_name = urlItem.site_name;
      result.page_detail = urlItem.page_detail;
      
      await saveResult(result);
      
      completed++;
      console.log(`✅ 완료: ${completed}/${urls.length}`);
      
    } catch (error) {
      failed++;
      console.error(`❌ 실패 (${i + 1}/${urls.length}): ${urlItem.url}`, error.message);
      
      // 실패해도 0점으로 저장
      try {
        await saveResult({
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
    
    // API 제한 방지 딜레이
    if (i < urls.length - 1) {
      await sleep(1000);
    }
  }
  
  console.log(`\n🎉 측정 완료: 성공 ${completed}개, 실패 ${failed}개`);
}

function saveResult(result) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO measurements (
        url_master_id, measured_at, url, site_name, page_detail, network,
        performance_score, status, fcp, lcp, tbt, speed_index, cls, tti,
        measurement_time, issues, suggestions, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      result.measurement_time,
      result.issues || null,
      result.suggestions || null,
      result.error || null
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 메인 실행
async function main() {
  console.log('\n🕐 예약된 측정 시작:', new Date().toLocaleString('ko-KR'));
  
  // URL 목록 가져오기
  db.all('SELECT * FROM url_master WHERE is_active = 1', async (err, urls) => {
    if (err) {
      console.error('❌ URL 조회 실패:', err);
      process.exit(1);
    }
    
    if (urls.length === 0) {
      console.log('⚠️  측정할 URL이 없습니다.');
      process.exit(0);
    }
    
    // 네트워크 타입 필터링 (GitHub Actions에서만)
    let filteredUrls = urls;
    if (NETWORK_TYPE) {
      filteredUrls = urls.filter(u => u.network === NETWORK_TYPE);
      console.log(`📱 네트워크 필터: ${NETWORK_TYPE} (${filteredUrls.length}개)`);
    }
    
    console.log(`📊 ${filteredUrls.length}개 URL 측정 시작`);
    
    await measureAndSave(filteredUrls);
    
    db.close();
    process.exit(0);
  });
}

main();