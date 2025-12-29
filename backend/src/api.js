require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

// Auto-pull 추가
const { autoPull } = require('../auto-pull');

// pagespeed 함수들 import
const pagespeed = require('./pagespeed');
const measurePageSpeed = pagespeed.measurePageSpeed;

// 스케줄러 import
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend')));

// 측정 상태 관리
let isMeasurementRunning = false;
let measurementStatus = {
  isRunning: false,
  total: 0,
  completed: 0,
  failed: 0
};
let measurementTimeout = null;

// ==================== API Routes ====================

// 통계 API
app.get('/api/stats', (req, res) => {
  const queries = [
    new Promise((resolve, reject) => {
      db.get('SELECT AVG(performance_score) as avg_performance FROM measurements', (err, row) => {
        if (err) reject(err);
        else resolve({ avg_performance: row.avg_performance });
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(DISTINCT url) as total_urls FROM url_master WHERE is_active = 1', (err, row) => {
        if (err) reject(err);
        else resolve({ total_urls: row.total_urls });
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total_measurements FROM measurements', (err, row) => {
        if (err) reject(err);
        else resolve({ total_measurements: row.total_measurements });
      });
    })
  ];

  Promise.all(queries)
    .then(results => {
      res.json({
        avg_performance: results[0].avg_performance,
        total_urls: results[1].total_urls,
        total_measurements: results[2].total_measurements
      });
    })
    .catch(err => {
      console.error('통계 조회 실패:', err);
      res.status(500).json({ error: '통계 조회 실패' });
    });
});

// 측정 결과 조회 API
app.get('/api/measurements', (req, res) => {
  const limit = req.query.limit || 1000;
  
  db.all(
    `SELECT * FROM measurements 
     ORDER BY measured_at DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        console.error('측정 결과 조회 실패:', err);
        return res.status(500).json({ error: '측정 결과 조회 실패' });
      }
      
      res.json({
        measurements: rows,
        count: rows.length
      });
    }
  );
});

// URL 목록 조회
app.get('/api/urls', (req, res) => {
  db.all('SELECT * FROM url_master ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error('URL 목록 조회 실패:', err);
      return res.status(500).json({ error: 'URL 목록 조회 실패' });
    }
    res.json(rows);
  });
});

// URL 추가
app.post('/api/urls', (req, res) => {
  const { url, site_name, page_detail, network } = req.body;
  
  if (!url || !network) {
    return res.status(400).json({ error: 'URL과 네트워크는 필수입니다.' });
  }

  db.run(
    'INSERT INTO url_master (url, site_name, page_detail, network) VALUES (?, ?, ?, ?)',
    [url, site_name, page_detail, network],
    function(err) {
      if (err) {
        console.error('URL 추가 실패:', err);
        return res.status(500).json({ error: 'URL 추가 실패' });
      }
      
      res.json({
        success: true,
        id: this.lastID
      });
    }
  );
});

// URL 수정
app.put('/api/urls/:id', (req, res) => {
  const { id } = req.params;
  const { url, site_name, page_detail, network, is_active } = req.body;

  db.run(
    `UPDATE url_master 
     SET url = ?, site_name = ?, page_detail = ?, network = ?, is_active = ?
     WHERE id = ?`,
    [url, site_name, page_detail, network, is_active, id],
    function(err) {
      if (err) {
        console.error('URL 수정 실패:', err);
        return res.status(500).json({ error: 'URL 수정 실패' });
      }
      
      res.json({
        success: true,
        changes: this.changes
      });
    }
  );
});

// URL 삭제
app.delete('/api/urls/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM url_master WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('URL 삭제 실패:', err);
      return res.status(500).json({ error: 'URL 삭제 실패' });
    }
    
    res.json({
      success: true,
      changes: this.changes
    });
  });
});

// 성능 측정 시작
app.post('/api/measure', async (req, res) => {
  if (isMeasurementRunning) {
    return res.json({
      success: false,
      message: '이미 측정이 진행 중입니다.'
    });
  }

  try {
    // 네트워크 필터 받기
    const { network } = req.body;
    
    db.all('SELECT * FROM url_master WHERE is_active = 1', async (err, urls) => {
      if (err) {
        console.error('URL 조회 실패:', err);
        return res.json({
          success: false,
          message: 'URL 조회 실패'
        });
      }

      // 네트워크 필터링
      let filteredUrls = urls;
      if (network && network !== 'all') {
        filteredUrls = urls.filter(u => u.network === network);
        console.log(`\n📱 네트워크 필터: ${network} (${filteredUrls.length}개)`);
      }

      if (filteredUrls.length === 0) {
        return res.json({
          success: false,
          message: '측정할 URL이 없습니다.'
        });
      }

      // 측정 시작
      isMeasurementRunning = true;
      measurementStatus = {
        isRunning: true,
        total: filteredUrls.length,
        completed: 0,
        failed: 0
      };

      // 타임아웃 설정 (180분)
      measurementTimeout = setTimeout(() => {
        if (isMeasurementRunning) {
          console.log('\n⏱️  측정 타임아웃 (180분)');
          isMeasurementRunning = false;
          measurementStatus.isRunning = false;
        }
      }, 180 * 60 * 1000);

      res.json({
        success: true,
        count: filteredUrls.length,
        network: network || 'all'
      });

      // 비동기로 측정 실행
      measureAndSave(filteredUrls).then(() => {
        isMeasurementRunning = false;
        measurementStatus.isRunning = false;
        
        // 타임아웃 클리어
        if (measurementTimeout) {
          clearTimeout(measurementTimeout);
          measurementTimeout = null;
        }
        
        console.log('\n✅ 모든 측정 완료!');
      }).catch(error => {
        isMeasurementRunning = false;
        measurementStatus.isRunning = false;
        
        // 타임아웃 클리어
        if (measurementTimeout) {
          clearTimeout(measurementTimeout);
          measurementTimeout = null;
        }
        
        console.error('\n❌ 측정 중 오류:', error);
      });
    });

  } catch (error) {
    console.error('측정 시작 실패:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

// 측정 상태 조회
app.get('/api/measurement-status', (req, res) => {
  res.json(measurementStatus);
});

// 측정 결과 전체 삭제
app.delete('/api/measurements', (req, res) => {
  db.run('DELETE FROM measurements', function(err) {
    if (err) {
      console.error('측정 결과 삭제 실패:', err);
      return res.status(500).json({ 
        success: false,
        error: '측정 결과 삭제 실패' 
      });
    }
    
    res.json({
      success: true,
      message: `${this.changes}개의 측정 결과가 삭제되었습니다.`,
      deleted: this.changes
    });
  });
});

// ==================== 측정 함수 ====================

async function measureAndSave(urls) {
  console.log(`\n📊 ${urls.length}개 URL 측정 시작`);
  
  for (let i = 0; i < urls.length; i++) {
    const urlItem = urls[i];
    
    try {
      console.log(`\n[${i + 1}/${urls.length}] 측정 중: ${urlItem.url} (${urlItem.network})`);
      
      const result = await measurePageSpeed(urlItem.url, urlItem.network);
      
      result.url_master_id = urlItem.id;
      result.site_name = urlItem.site_name;
      result.page_detail = urlItem.page_detail;
      
      await saveResult(result);
      
      measurementStatus.completed++;
      console.log(`✅ 완료: ${measurementStatus.completed}/${urls.length}`);
      
    } catch (error) {
      measurementStatus.failed++;
      console.error(`❌ 실패 (${i + 1}/${urls.length}): ${urlItem.url}`, error.message);
      
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
    
    if (i < urls.length - 1) {
      await sleep(1000);
    }
  }
  
  console.log(`\n🎉 측정 완료: 성공 ${measurementStatus.completed}개, 실패 ${measurementStatus.failed}개`);
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

// ==================== 서버 시작 (자동 Pull 포함) ====================

async function startServer() {
  // 서버 시작 전 자동 pull
  try {
    await autoPull();
  } catch (error) {
    console.warn('⚠️  Git pull 실패했지만 서버는 시작합니다.');
    console.warn('    수동으로 git pull을 실행해주세요.');
  }
  
  app.listen(PORT, () => {
    console.log(`\n🚀 서버 실행 중: http://localhost:${PORT}`);
    console.log(`📊 대시보드: http://localhost:${PORT}/index.html`);
    console.log(`⚙️  URL 관리: http://localhost:${PORT}/url-manager.html`);
    
    // 스케줄러 시작
    console.log('\n--- 스케줄러 설정 ---');
    scheduler.startScheduler();
    
    console.log('\n💡 팁: 서버를 재시작하면 최신 데이터를 자동으로 받아옵니다.\n');
  });
}

// 서버 시작
startServer();