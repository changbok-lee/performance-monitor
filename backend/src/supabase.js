// Supabase 클라이언트 모듈
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_KEY 환경변수가 설정되지 않았습니다.');
}

async function supabaseRequest(endpoint, options = {}) {
  const { method = 'GET', body, select, filters = '', count = false } = options;

  let url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  if (select) url += `?select=${select}`;
  if (filters) url += (select ? '&' : '?') + filters;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (count) {
    headers['Prefer'] = 'count=exact';
  }
  if (method === 'POST') {
    headers['Prefer'] = 'return=representation';
  }
  if (method === 'DELETE' || method === 'PATCH') {
    headers['Prefer'] = 'return=minimal';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase 오류: ${response.status} - ${error}`);
  }

  // DELETE나 204 응답은 빈 객체 반환
  if (method === 'DELETE' || response.status === 204) {
    return { success: true };
  }

  const data = await response.json();

  if (count) {
    const range = response.headers.get('content-range');
    const total = range ? parseInt(range.split('/')[1]) : data.length;
    return { data, count: total };
  }

  return data;
}

// ==================== URL Master ====================

async function getAllUrls() {
  return await supabaseRequest('url_master', {
    select: '*',
    filters: 'order=id.desc'
  });
}

async function getActiveUrls() {
  return await supabaseRequest('url_master', {
    select: '*',
    filters: 'is_active=eq.1'
  });
}

async function addUrl(url, site_name, page_detail, network) {
  const result = await supabaseRequest('url_master', {
    method: 'POST',
    body: { url, site_name, page_detail, network }
  });
  return result[0];
}

async function updateUrl(id, data) {
  await supabaseRequest(`url_master?id=eq.${id}`, {
    method: 'PATCH',
    body: data
  });
  return { success: true };
}

async function deleteUrl(id) {
  await supabaseRequest(`url_master?id=eq.${id}`, {
    method: 'DELETE'
  });
  return { success: true };
}

// ==================== Measurements ====================

async function getMeasurements(limit = 10000) {
  return await supabaseRequest('measurements', {
    select: '*',
    filters: `order=measured_at.desc&limit=${limit}`
  });
}

async function saveMeasurement(result) {
  return await supabaseRequest('measurements', {
    method: 'POST',
    body: {
      url_master_id: result.url_master_id,
      measured_at: result.measured_at,
      url: result.url,
      site_name: result.site_name,
      page_detail: result.page_detail,
      network: result.network,
      performance_score: result.performance_score,
      status: result.status,
      fcp: result.fcp,
      lcp: result.lcp,
      tbt: result.tbt,
      speed_index: result.speed_index,
      cls: result.cls,
      tti: result.tti,
      measurement_time: result.measurement_time,
      issues: result.issues || null,
      suggestions: result.suggestions || null,
      error: result.error || null
    }
  });
}

async function deleteAllMeasurements() {
  // 전체 삭제는 조건 필요 (Supabase 보안)
  await supabaseRequest('measurements?id=gt.0', {
    method: 'DELETE'
  });
  return { success: true };
}

// ==================== Stats ====================

async function getStats() {
  // 평균 성능 점수
  const measurements = await supabaseRequest('measurements', {
    select: 'performance_score'
  });

  const validScores = measurements.filter(m => m.performance_score > 0);
  const avgPerformance = validScores.length > 0
    ? validScores.reduce((sum, m) => sum + m.performance_score, 0) / validScores.length
    : 0;

  // 활성 URL 수
  const { count: totalUrls } = await supabaseRequest('url_master', {
    select: 'id',
    filters: 'is_active=eq.1',
    count: true
  });

  // 총 측정 횟수
  const { count: totalMeasurements } = await supabaseRequest('measurements', {
    select: 'id',
    count: true
  });

  return {
    avg_performance: avgPerformance,
    total_urls: totalUrls,
    total_measurements: totalMeasurements
  };
}

// ==================== Improvement Report ====================

async function getRecentMeasurementsWithIssues(days = 10) {
  // 최근 N일간의 측정 데이터 조회 (suggestions가 있는 것만)
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  return await supabaseRequest('measurements', {
    select: 'id,url,site_name,page_detail,network,suggestions,measured_at',
    filters: `measured_at=gte.${sinceStr}&suggestions=not.is.null&order=measured_at.desc`
  });
}

// ==================== Improvement Suggestions Cache ====================

async function getImprovementSuggestions() {
  return await supabaseRequest('improvement_suggestions', {
    select: '*',
    filters: 'order=id.asc'
  });
}

async function saveImprovementSuggestion(issueKey, solution) {
  // upsert: 있으면 업데이트, 없으면 삽입
  const existing = await supabaseRequest('improvement_suggestions', {
    select: 'id',
    filters: `issue_key=eq.${encodeURIComponent(issueKey)}`
  });

  if (existing && existing.length > 0) {
    await supabaseRequest(`improvement_suggestions?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      body: { solution, updated_at: new Date().toISOString() }
    });
  } else {
    await supabaseRequest('improvement_suggestions', {
      method: 'POST',
      body: { issue_key: issueKey, solution, created_at: new Date().toISOString() }
    });
  }
  return { success: true };
}

module.exports = {
  getAllUrls,
  getActiveUrls,
  addUrl,
  updateUrl,
  deleteUrl,
  getMeasurements,
  saveMeasurement,
  deleteAllMeasurements,
  getStats,
  getRecentMeasurementsWithIssues,
  getImprovementSuggestions,
  saveImprovementSuggestion
};
