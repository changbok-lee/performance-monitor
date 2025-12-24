require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

// pagespeed 함수들 import
const pagespeed = require('./pagespeed');
const measurePageSpeed = pagespeed.measurePageSpeed;

// 스케줄러 import
const scheduler = require('./scheduler');

const app = express();
const PORT = 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 정적 파일 제공 (프론트엔드)
app.use(express.static(path.join(__dirname, '../../frontend')));

// ==================== 측정 상태 관리 ====================

let measurementStatus = {
  isRunning: false,
  total: 0,
  completed: 0,
  failed: 0,
  startTime: null
};

// ==================== API 엔드포인트 ====================

// 1. URL 목록 조회
app.get('/api/urls', (req, res) => {
  db.all('SELECT * FROM url_master WHERE is_active = 1 ORDER BY id', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ urls: rows, count: rows.length });
  });
});

// 2. URL 일괄 저장 (엑셀 복붙용)
app.post('/api/urls/bulk', (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: '잘못된 데이터 형식' });
  }

  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO url_master (url, site_name, page_detail, network)
      VALUES (?, ?, ?, ?)
    `);

    let successCount = 0;
    let errorCount = 0;

    urls.forEach(item => {
      stmt.run(
        item.url,
        item.site_name,
        item.page_detail,
        item.network,
        (err) => {
          if (err) {
            errorCount++;
            console.error('저장 실패:', item.url, err.message);
          } else {
            successCount++;
          }
        }
      );
    });

    stmt.finalize(() => {
      res.json({
        success: true,
        message: `${successCount}개 저장 완료, ${errorCount}개 실패`,
        successCount,
        errorCount
      });
    });
  });
});

// 3. URL 개별 삭제
app.delete('/api/urls/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM url_master WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, message: '삭제 완료' });
  });
});

// 4. URL 전체 삭제
app.delete('/api/urls', (req, res) => {
  db.run('DELETE FROM url_master', (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, message: '전체 삭제 완료' });
  });
});

// 5. 성능 측정 실행
app.post('/api/measure', async (req, res) => {
  try {
    // 이미 측정 중인지 확인
    if (measurementStatus.isRunning) {
      return res.json({ 
        success: false, 
        message: '이미 측정이 진행 중입니다.' 
      });
    }

    // URL 목록 가져오기
    db.all('SELECT * FROM url_master WHERE is_active = 1', async (err, urls) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (urls.length === 0) {
        return res.json({ 
          success: false,
          message: '측정할 URL이 없습니다. URL을 먼저 등록해주세요.' 
        });
      }

      // 측정 상태 초기화
      measurementStatus = {
        isRunning: true,
        total: urls.length,
        completed: 0,
        failed: 0,
        startTime: new Date()
      };

      // 측정 시작 응답
      res.json({ 
        success: true, 
        message: `${urls.length}개 URL 측정 시작`,
        count: urls.length 
      });

      // 백그라운드에서 측정 실행
      measureAndSave(urls);
    });

  } catch (error) {
    measurementStatus.isRunning = false;
    res.status(500).json({ error: error.message });
  }
});

// 6. 측정 결과 조회
app.get('/api/measurements', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  
  db.all(
    `SELECT * FROM measurements 
     ORDER BY measured_at DESC 
     LIMIT ? OFFSET ?`,
    [parseInt(limit), parseInt(offset)],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ measurements: rows, count: rows.length });
    }
  );
});

// 7. 통계 데이터
app.get('/api/stats', (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as total_measurements,
      COUNT(DISTINCT url) as total_urls,
      AVG(performance_score) as avg_performance,
      MAX(measured_at) as last_measured
    FROM measurements
  `, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(stats || {
      total_measurements: 0,
      total_urls: 0,
      avg_performance: 0,
      last_measured: null
    });
  });
});

// 8. 측정 상태 확인
app.get('/api/measurement-status', (req, res) => {
  res.json(measurementStatus);
});

// 9. 측정 결과 전체 삭제
app.delete('/api/measurements', (req, res) => {
  db.run('DELETE FROM measurements', (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, message: '모든 측정 결과 삭제 완료' });
  });
});

// 10. 즉시 측정 실행 (스케줄러 사용)
app.post('/api/measure-now', async (req, res) => {
  res.json({ 
    success: true, 
    message: '스케줄러로 측정 시작'
  });
  
  // 백그라운드에서 실행
  scheduler.runNow();
});

// ==================== 측정 및 저장 함수 ====================

async function measureAndSave(urls) {
  console.log(`\n📊 측정 시작: ${urls.length}개 URL`);
  
  try {
    // 하나씩 측정하면서 상태 업데이트
    for (let i = 0; i < urls.length; i++) {
      const urlItem = urls[i];
      
      try {
        console.log(`측정 중 (${i + 1}/${urls.length}): ${urlItem.url} (${urlItem.network})`);
        
        const result = await measurePageSpeed(urlItem.url, urlItem.network);
        
        // URL 정보 추가
        result.url_master_id = urlItem.id;
        result.site_name = urlItem.site_name;
        result.page_detail = urlItem.page_detail;
        
        // DB 저장 (성공이든 실패든 모두 저장)
        await saveResult(result);
        
        if (result.error) {
          // 측정은 했지만 에러가 있는 경우
          measurementStatus.failed++;
          console.log(`⚠️  에러: ${measurementStatus.failed}/${urls.length} - ${result.error}`);
        } else {
          // 정상 완료
          measurementStatus.completed++;
          console.log(`✅ 완료: ${measurementStatus.completed}/${urls.length}`);
        }
        
      } catch (error) {
        // saveResult 실패 등 예상치 못한 에러
        measurementStatus.failed++;
        console.error(`❌ 저장 실패 (${i + 1}/${urls.length}): ${urlItem.url}`, error.message);
      }
      
      // API 제한 방지 딜레이
      if (i < urls.length - 1) {
        await sleep(1000);
      }
    }
    
    console.log(`\n🎉 측정 완료: 성공 ${measurementStatus.completed}개, 실패/에러 ${measurementStatus.failed}개`);
    measurementStatus.isRunning = false;

  } catch (error) {
    console.error('❌ 측정 중 오류:', error.message);
    measurementStatus.isRunning = false;
  }
}

// DB 저장 Promise 래퍼
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
      result.error || null  // 에러 필드 추가
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 서버 시작 ====================

app.listen(PORT, () => {
  console.log(`\n🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📊 대시보드: http://localhost:${PORT}/index.html`);
  console.log(`⚙️  URL 관리: http://localhost:${PORT}/url-manager.html`);
  
  // 스케줄러 시작
  console.log('\n--- 스케줄러 설정 ---');
  scheduler.startScheduler(); // 매일 새벽 2시 자동 실행
  
  console.log('\n💡 팁: 즉시 테스트하려면 대시보드에서 "🚀 지금 측정 시작" 버튼 클릭\n');
});