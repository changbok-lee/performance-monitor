require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_KEY가 .env에 없습니다.');
  process.exit(1);
}

const dbPath = path.join(__dirname, '../database/performance.db');
const db = new sqlite3.Database(dbPath);

async function supabaseRequest(endpoint, method, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase 오류: ${response.status} - ${error}`);
  }

  return response;
}

function getAllFromSqlite(query) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  console.log('🚀 Supabase 마이그레이션 시작...\n');

  try {
    // 1. url_master 마이그레이션
    console.log('📋 url_master 데이터 가져오는 중...');
    const urlMasterData = await getAllFromSqlite('SELECT * FROM url_master');
    console.log(`   ${urlMasterData.length}개 레코드 발견`);

    if (urlMasterData.length > 0) {
      console.log('   Supabase에 업로드 중...');

      // id 필드 제거 (Supabase에서 자동 생성)
      const urlMasterClean = urlMasterData.map(row => ({
        id: row.id,  // 기존 ID 유지 (measurements 참조용)
        url: row.url,
        site_name: row.site_name,
        page_detail: row.page_detail,
        network: row.network,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      // 50개씩 배치로 업로드
      for (let i = 0; i < urlMasterClean.length; i += 50) {
        const batch = urlMasterClean.slice(i, i + 50);
        await supabaseRequest('url_master', 'POST', batch);
        console.log(`   ${Math.min(i + 50, urlMasterClean.length)}/${urlMasterClean.length} 완료`);
      }
      console.log('✅ url_master 마이그레이션 완료!\n');
    }

    // 2. measurements 마이그레이션
    console.log('📊 measurements 데이터 가져오는 중...');
    const measurementsData = await getAllFromSqlite('SELECT * FROM measurements');
    console.log(`   ${measurementsData.length}개 레코드 발견`);

    if (measurementsData.length > 0) {
      console.log('   Supabase에 업로드 중...');

      const measurementsClean = measurementsData.map(row => ({
        url_master_id: row.url_master_id,
        measured_at: row.measured_at,
        url: row.url,
        site_name: row.site_name,
        page_detail: row.page_detail,
        network: row.network,
        performance_score: row.performance_score,
        status: row.status,
        fcp: row.fcp,
        lcp: row.lcp,
        tbt: row.tbt,
        speed_index: row.speed_index,
        cls: row.cls,
        tti: row.tti,
        measurement_time: row.measurement_time,
        issues: row.issues,
        suggestions: row.suggestions,
        error: row.error,
        created_at: row.created_at
      }));

      // 100개씩 배치로 업로드
      for (let i = 0; i < measurementsClean.length; i += 100) {
        const batch = measurementsClean.slice(i, i + 100);
        await supabaseRequest('measurements', 'POST', batch);
        console.log(`   ${Math.min(i + 100, measurementsClean.length)}/${measurementsClean.length} 완료`);
      }
      console.log('✅ measurements 마이그레이션 완료!\n');
    }

    console.log('🎉 모든 마이그레이션이 완료되었습니다!');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
  } finally {
    db.close();
  }
}

migrate();
