// auth.js에서 API_BASE, getAuthHeaders 사용

let allMeasurements = [];
let currentFilter = 'all';
let currentSort = { column: 'latest', order: 'desc' };
let measurementCheckInterval = null;
let currentNetworkTab = 'Mobile';
let currentMainTab = 'dashboard';

// ==================== 메인 탭 전환 ====================

function switchMainTab(tabName) {
  currentMainTab = tabName;

  // 모든 탭 컨텐츠 숨기기
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // 선택된 탭 컨텐츠 표시
  const selectedTab = document.getElementById(`tab-${tabName}`);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  // 탭 버튼 활성화 상태 변경
  document.querySelectorAll('.main-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // 측정 버튼 표시/숨김 (측정결과 탭에서만 표시)
  const measureButtons = document.getElementById('measureButtons');
  if (measureButtons) {
    if (tabName === 'results') {
      measureButtons.classList.add('visible');
    } else {
      measureButtons.classList.remove('visible');
    }
  }

  // URL 관리 탭으로 전환 시 URL 목록 로드
  if (tabName === 'urlmanager') {
    if (typeof loadUrls === 'function') {
      loadUrls();
    }
  }
}

// ==================== 한국시간 변환 유틸리티 ====================

// UTC 시간을 한국시간으로 변환
function toKoreaTime(date) {
  const utcTime = date.getTime();
  const koreaOffset = 9 * 60 * 60 * 1000; // UTC+9
  return new Date(utcTime + koreaOffset);
}

// ISO 문자열을 한국시간 Date 객체로
function parseToKoreaTime(isoString) {
  const utcDate = new Date(isoString);
  return toKoreaTime(utcDate);
}

// 한국시간으로 날짜/시간 포맷팅
function formatDateTime(isoString) {
  const date = new Date(isoString);

  // DB에 저장된 시간은 UTC 시간
  // 9시간을 더해서 한국시간으로 변환
  const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));

  const month = koreaDate.getUTCMonth() + 1;
  const day = koreaDate.getUTCDate();
  const hours = koreaDate.getUTCHours();
  const minutes = String(koreaDate.getUTCMinutes()).padStart(2, '0');
  const period = hours < 12 ? '오전' : '오후';
  const displayHours = hours % 12 || 12;

  return `${month}월 ${day}일 ${period} ${String(displayHours).padStart(2, '0')}:${minutes}`;
}

// 한국시간으로 날짜만 포맷팅
function formatDate(isoString) {
  const date = new Date(isoString);

  // 9시간을 더해서 한국시간으로 변환
  const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));

  const month = koreaDate.getUTCMonth() + 1;
  const day = koreaDate.getUTCDate();

  return `${month}월 ${day}일`;
}

// 한국시간으로 상세 날짜/시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
function formatDetailDateTime(isoString) {
  const date = new Date(isoString);

  // 9시간을 더해서 한국시간으로 변환
  const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));

  const year = koreaDate.getUTCFullYear();
  const month = String(koreaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(koreaDate.getUTCDate()).padStart(2, '0');
  const hours = String(koreaDate.getUTCHours()).padStart(2, '0');
  const minutes = String(koreaDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(koreaDate.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ==================== 상태 한글 변환 ====================

function getStatusKorean(status) {
  if (status === 'Good') return '우수';
  if (status === 'Needs Improvement') return '보통';
  if (status === 'Poor') return '개선 필요';
  if (status === 'Failed') return '실패';
  return status;
}

// ==================== 대시보드 로드 ====================

async function loadDashboard() {
  try {
    showLoading();
    
    const response = await fetch(`${API_BASE}/measurements`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error('데이터를 불러오는데 실패했습니다.');
    }
    
    const data = await response.json();
    
    // 배열 형식 확인 및 변환
    if (Array.isArray(data)) {
      allMeasurements = data;
    } else if (data.measurements && Array.isArray(data.measurements)) {
      allMeasurements = data.measurements;
    } else {
      allMeasurements = [];
      console.warn('예상치 못한 응답 형식:', data);
    }
    
    console.log('로드된 데이터:', allMeasurements.length, '개');
    
    displaySummary(allMeasurements);
    displayStatusDistribution(allMeasurements);
    displayNetworkComparison(allMeasurements);
    displayPerformanceTrend(allMeasurements);
    renderPageComparison(allMeasurements);
    displayMeasurements(allMeasurements, currentNetworkTab);
    populateFilters(allMeasurements);
    
    hideLoading();
  } catch (error) {
    console.error('대시보드 로드 실패:', error);
    hideLoading();
    alert('데이터를 불러오는데 실패했습니다: ' + error.message);
  }
}

// ==================== 통합 요약 ====================

function displaySummary(measurements) {
  const avgPerf = document.getElementById('avgPerformance');
  const totalUrls = document.getElementById('totalUrls');
  const totalMeas = document.getElementById('totalMeasurements');

  if (!avgPerf || !totalUrls || !totalMeas) {
    console.warn('Summary 요소를 찾을 수 없습니다.');
    return;
  }

  if (measurements.length === 0) {
    avgPerf.textContent = '-';
    totalUrls.textContent = '-';
    totalMeas.textContent = '-';
    return;
  }

  const validScores = measurements.filter(m => m.performance_score > 0);
  const avgScore = validScores.reduce((sum, m) => sum + m.performance_score, 0) / validScores.length;

  // URL+네트워크 조합으로 카운트 (Mobile, Desktop 각각)
  const uniqueUrlNetworks = [...new Set(measurements.map(m => `${m.url}|${m.network}`))];

  avgPerf.textContent = Math.round(avgScore);
  totalUrls.textContent = uniqueUrlNetworks.length;
  totalMeas.textContent = measurements.length;
}

// ==================== 데일리 상태별 분포 ====================

function displayStatusDistribution(measurements) {
  const dailyStatusDate = document.getElementById('dailyStatusDate');
  const dailyGoodCount = document.getElementById('dailyGoodCount');
  const dailyWarningCount = document.getElementById('dailyWarningCount');
  const dailyPoorCount = document.getElementById('dailyPoorCount');
  const dailyFailedCount = document.getElementById('dailyFailedCount');

  if (!dailyGoodCount || !dailyWarningCount || !dailyPoorCount || !dailyFailedCount) {
    console.warn('Daily status distribution 요소를 찾을 수 없습니다.');
    return;
  }

  if (measurements.length === 0) {
    if (dailyStatusDate) dailyStatusDate.textContent = '-';
    dailyGoodCount.textContent = '0개 (0%)';
    dailyWarningCount.textContent = '0개 (0%)';
    dailyPoorCount.textContent = '0개 (0%)';
    dailyFailedCount.textContent = '0개 (0%)';
    return;
  }

  // 가장 최근 측정 날짜 찾기 (한국시간 기준)
  let latestDate = null;
  let latestDateKey = null;

  measurements.forEach(m => {
    const date = new Date(m.measured_at);
    const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const dateKey = koreaDate.toISOString().split('T')[0];

    if (!latestDate || date > latestDate) {
      latestDate = date;
      latestDateKey = dateKey;
    }
  });

  // 최근 날짜의 측정 데이터만 필터링
  const dailyMeasurements = measurements.filter(m => {
    const date = new Date(m.measured_at);
    const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const dateKey = koreaDate.toISOString().split('T')[0];
    return dateKey === latestDateKey;
  });

  // 상태별 카운트
  const statusCounts = {
    'Good': 0,
    'Needs Improvement': 0,
    'Poor': 0,
    'Failed': 0
  };

  dailyMeasurements.forEach(m => {
    // performance_score가 없거나 0이면 실패 처리
    const hasValidScore = m.performance_score && m.performance_score > 0;
    const actualStatus = hasValidScore ? m.status : 'Failed';

    if (actualStatus === 'Good') {
      statusCounts['Good']++;
    } else if (actualStatus === 'Needs Improvement') {
      statusCounts['Needs Improvement']++;
    } else if (actualStatus === 'Poor') {
      statusCounts['Poor']++;
    } else {
      statusCounts['Failed']++;
    }
  });

  const total = dailyMeasurements.length || 1;

  // 날짜 표시 (한국시간)
  if (dailyStatusDate && latestDateKey) {
    const [, month, day] = latestDateKey.split('-');
    dailyStatusDate.textContent = `(${parseInt(month)}월 ${parseInt(day)}일 측정 기준)`;
  }

  // 상태별 분포 표시
  dailyGoodCount.textContent = `${statusCounts['Good']}개 (${((statusCounts['Good'] / total) * 100).toFixed(1)}%)`;
  dailyWarningCount.textContent = `${statusCounts['Needs Improvement']}개 (${((statusCounts['Needs Improvement'] / total) * 100).toFixed(1)}%)`;
  dailyPoorCount.textContent = `${statusCounts['Poor']}개 (${((statusCounts['Poor'] / total) * 100).toFixed(1)}%)`;
  dailyFailedCount.textContent = `${statusCounts['Failed']}개 (${((statusCounts['Failed'] / total) * 100).toFixed(1)}%)`;
}

// ==================== 네트워크 비교 ====================

function displayNetworkComparison(measurements) {
  // Mobile (4G)
  const mobilePerf = document.getElementById('mobilePerf');
  const mobileFcp = document.getElementById('mobileFcp');
  const mobileLcp = document.getElementById('mobileLcp');
  const mobileTbt = document.getElementById('mobileTbt');

  // Mobile (5G)
  const mobile5gPerf = document.getElementById('mobile5gPerf');
  const mobile5gFcp = document.getElementById('mobile5gFcp');
  const mobile5gLcp = document.getElementById('mobile5gLcp');
  const mobile5gTbt = document.getElementById('mobile5gTbt');

  // Desktop
  const desktopPerf = document.getElementById('desktopPerf');
  const desktopFcp = document.getElementById('desktopFcp');
  const desktopLcp = document.getElementById('desktopLcp');
  const desktopTbt = document.getElementById('desktopTbt');

  if (!mobilePerf || !desktopPerf) {
    console.warn('Network comparison 요소를 찾을 수 없습니다.');
    return;
  }

  const mobileData = measurements.filter(m => m.network === 'Mobile');
  const desktopData = measurements.filter(m => m.network === 'Desktop');

  function calculateAverage(data) {
    if (data.length === 0) return { score: 0, fcp: 0, lcp: 0, tbt: 0 };
    const validData = data.filter(m => m.performance_score > 0);
    if (validData.length === 0) return { score: 0, fcp: 0, lcp: 0, tbt: 0 };

    return {
      score: Math.round(validData.reduce((sum, m) => sum + m.performance_score, 0) / validData.length),
      fcp: (validData.reduce((sum, m) => sum + m.fcp, 0) / validData.length).toFixed(2),
      lcp: (validData.reduce((sum, m) => sum + m.lcp, 0) / validData.length).toFixed(2),
      tbt: Math.round(validData.reduce((sum, m) => sum + m.tbt, 0) / validData.length)
    };
  }

  const mobileAvg = calculateAverage(mobileData);
  const desktopAvg = calculateAverage(desktopData);

  // Mobile (5G) 추정값 계산 (Mobile 4G 기반)
  // 5G는 4G보다 약 25배 빠른 네트워크 (10Mbps vs 400Kbps)
  // Performance: 4G와 Desktop 중간 (4G + 15점 정도)
  // FCP/LCP: 4G의 약 60% (네트워크 개선 반영)
  // TBT: CPU 바운드라 거의 동일 (약 90%)
  const mobile5gEstimate = {
    score: mobileAvg.score ? Math.min(Math.round(mobileAvg.score + 15), 100) : 0,
    fcp: mobileAvg.fcp ? (parseFloat(mobileAvg.fcp) * 0.6).toFixed(2) : 0,
    lcp: mobileAvg.lcp ? (parseFloat(mobileAvg.lcp) * 0.6).toFixed(2) : 0,
    tbt: mobileAvg.tbt ? Math.round(mobileAvg.tbt * 0.9) : 0
  };

  // Mobile (4G)
  mobilePerf.textContent = mobileAvg.score || '-';
  mobileFcp.textContent = mobileAvg.fcp ? mobileAvg.fcp + 's' : '-';
  mobileLcp.textContent = mobileAvg.lcp ? mobileAvg.lcp + 's' : '-';
  if (mobileTbt) mobileTbt.textContent = mobileAvg.tbt ? mobileAvg.tbt + 'ms' : '-';

  // Mobile (5G) - 추정값
  if (mobile5gPerf) mobile5gPerf.textContent = mobile5gEstimate.score || '-';
  if (mobile5gFcp) mobile5gFcp.textContent = mobile5gEstimate.fcp ? mobile5gEstimate.fcp + 's' : '-';
  if (mobile5gLcp) mobile5gLcp.textContent = mobile5gEstimate.lcp ? mobile5gEstimate.lcp + 's' : '-';
  if (mobile5gTbt) mobile5gTbt.textContent = mobile5gEstimate.tbt ? mobile5gEstimate.tbt + 'ms' : '-';

  // Desktop
  desktopPerf.textContent = desktopAvg.score || '-';
  desktopFcp.textContent = desktopAvg.fcp ? desktopAvg.fcp + 's' : '-';
  desktopLcp.textContent = desktopAvg.lcp ? desktopAvg.lcp + 's' : '-';
  if (desktopTbt) desktopTbt.textContent = desktopAvg.tbt ? desktopAvg.tbt + 'ms' : '-';
}

// ==================== 성능 추이 차트 (백업 HTML ID) ====================

function displayPerformanceTrend(measurements) {
  // ⭐ 백업 HTML의 차트 ID: performanceChart ⭐
  const canvas = document.getElementById('performanceChart');
  
  if (!canvas) {
    console.warn('Performance chart 요소를 찾을 수 없습니다.');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  if (window.trendChartInstance) {
    window.trendChartInstance.destroy();
  }
  
  const days180Ago = new Date();
  days180Ago.setDate(days180Ago.getDate() - 180);
  
  const recentData = measurements.filter(m => {
    const measureDate = new Date(m.measured_at);
    return measureDate >= days180Ago;
  });
  
  const mobileData = recentData.filter(m => m.network === 'Mobile');
  const desktopData = recentData.filter(m => m.network === 'Desktop');
  
  function groupByDate(data) {
    const grouped = {};
    data.forEach(m => {
      const date = new Date(m.measured_at);
      // 한국시간 기준으로 날짜 그룹핑 (UTC + 9시간)
      const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
      const dateKey = koreaDate.toISOString().split('T')[0];

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(m.performance_score);
    });

    return Object.keys(grouped)
      .sort()
      .map(date => ({
        date,
        avg: grouped[date].reduce((a, b) => a + b, 0) / grouped[date].length
      }));
  }
  
  const mobileByDate = groupByDate(mobileData);
  const desktopByDate = groupByDate(desktopData);
  
  const allDates = [...new Set([
    ...mobileByDate.map(d => d.date),
    ...desktopByDate.map(d => d.date)
  ])].sort();
  
  const mobileScores = allDates.map(date => {
    const found = mobileByDate.find(d => d.date === date);
    return found ? found.avg : null;
  });
  
  const desktopScores = allDates.map(date => {
    const found = desktopByDate.find(d => d.date === date);
    return found ? found.avg : null;
  });
  
  window.trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allDates,
      datasets: [
        {
          label: '📱 Mobile',
          data: mobileScores,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          tension: 0.1,
          spanGaps: true
        },
        {
          label: '💻 Desktop',
          data: desktopScores,
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.1)',
          tension: 0.1,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Performance Score'
          }
        },
        x: {
          title: {
            display: true,
            text: '날짜 (한국시간)'
          }
        }
      }
    }
  });
}

// ==================== 네트워크 탭 전환 ====================

function switchNetworkTab(network) {
  currentNetworkTab = network;

  // 탭 버튼 활성화
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // 필터 초기화
  resetFilters();

  // 데이터 표시
  displayMeasurements(allMeasurements, network);
}

// ==================== 5G 변환 로직 ====================

function convertTo5G(measurements) {
  return measurements.map(m => {
    const fcp_5g = m.fcp * 0.3;
    const lcp_5g = m.lcp * 0.3;
    const tbt_5g = m.tbt;
    const speed_index_5g = m.speed_index * 0.4;
    const cls_5g = m.cls; // CLS는 네트워크와 무관

    // Performance 점수 재계산 (Lighthouse 가중치 기반 근사치)
    // FCP 10%, LCP 25%, TBT 30%, CLS 25%, Speed Index 10%
    // 개선된 메트릭으로 점수 상승 추정
    const improvementFactor = calculateImprovementFactor(
      m.fcp, fcp_5g,
      m.lcp, lcp_5g,
      m.speed_index, speed_index_5g,
      m.performance_score
    );

    const new_score = Math.round(m.performance_score * improvementFactor);
    const final_score = isNaN(new_score) ? m.performance_score : Math.min(100, Math.max(0, new_score));

    return {
      ...m,
      fcp: fcp_5g,
      lcp: lcp_5g,
      tbt: tbt_5g,
      speed_index: speed_index_5g,
      cls: cls_5g,
      performance_score: final_score
    };
  });
}

function calculateImprovementFactor(fcp_old, fcp_new, lcp_old, lcp_new, si_old, si_new, currentScore) {
  // 메트릭 개선률 계산 (null 체크 포함)
  const fcpImprovement = (fcp_old && fcp_new) ? (fcp_old - fcp_new) / fcp_old : 0.7;
  const lcpImprovement = (lcp_old && lcp_new) ? (lcp_old - lcp_new) / lcp_old : 0.7;
  const siImprovement = (si_old && si_new) ? (si_old - si_new) / si_old : 0.6;

  // 가중 평균 개선률 (네트워크 영향 받는 메트릭만)
  // LCP 25% + FCP 10% + Speed Index 10% = 45% 총 가중치
  const weightedImprovement = (lcpImprovement * 0.55 + fcpImprovement * 0.22 + siImprovement * 0.22);

  // 점수 상승 계산
  // 낮은 점수일수록 개선 여지가 크므로 더 많이 상승
  // 높은 점수는 이미 최적화되어 있어 상승폭이 작음
  let improvementFactor;
  if (currentScore < 50) {
    improvementFactor = 1 + (weightedImprovement * 1.8); // Poor: 최대 2.26배
  } else if (currentScore < 90) {
    improvementFactor = 1 + (weightedImprovement * 1.3); // Needs Improvement: 최대 1.81배
  } else {
    improvementFactor = 1 + (weightedImprovement * 0.5); // Good: 최대 1.32배
  }

  return improvementFactor;
}

// ==================== 필터 채우기 ====================

function populateFilters(measurements) {
  const siteNameFilter = document.getElementById('siteNameFilter');
  const pageDetailFilter = document.getElementById('pageDetailFilter');
  
  if (!siteNameFilter || !pageDetailFilter) {
    return;
  }
  
  // 사이트명 필터
  const siteNames = [...new Set(measurements.map(m => m.site_name).filter(Boolean))];
  siteNameFilter.innerHTML = '<option value="">전체</option>';
  siteNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    siteNameFilter.appendChild(option);
  });
  
  // 페이지상세 필터
  const pageDetails = [...new Set(measurements.map(m => m.page_detail).filter(Boolean))];
  pageDetailFilter.innerHTML = '<option value="">전체</option>';
  pageDetails.forEach(detail => {
    const option = document.createElement('option');
    option.value = detail;
    option.textContent = detail;
    pageDetailFilter.appendChild(option);
  });
}

// ==================== 필터 적용 ====================

function applyFilters() {
  displayMeasurements(allMeasurements, currentNetworkTab);
}

function resetFilters() {
  const siteNameFilter = document.getElementById('siteNameFilter');
  const pageDetailFilter = document.getElementById('pageDetailFilter');
  const statusFilter = document.getElementById('statusFilter');
  const tableSearch = document.getElementById('tableSearch');
  
  if (siteNameFilter) siteNameFilter.value = '';
  if (pageDetailFilter) pageDetailFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  if (tableSearch) tableSearch.value = '';
  
  displayMeasurements(allMeasurements, currentNetworkTab);
}

// ==================== 측정 결과 표시 ====================

function displayMeasurements(measurements, network) {
  const tbody = document.getElementById('resultsTableBody');

  if (!tbody) {
    console.warn('Results table body를 찾을 수 없습니다.');
    return;
  }

  // 5G 예상값 탭인 경우 Mobile 데이터를 변환
  let filtered;
  if (network === 'Mobile5G') {
    filtered = measurements.filter(m => m.network === 'Mobile');
    filtered = convertTo5G(filtered);
  } else {
    filtered = measurements.filter(m => m.network === network);
  }
  
  // 추가 필터 적용
  const siteNameFilter = document.getElementById('siteNameFilter');
  const pageDetailFilter = document.getElementById('pageDetailFilter');
  const statusFilter = document.getElementById('statusFilter');
  const tableSearch = document.getElementById('tableSearch');
  
  if (siteNameFilter && siteNameFilter.value) {
    filtered = filtered.filter(m => m.site_name === siteNameFilter.value);
  }
  
  if (pageDetailFilter && pageDetailFilter.value) {
    filtered = filtered.filter(m => m.page_detail === pageDetailFilter.value);
  }
  
  if (statusFilter && statusFilter.value) {
    filtered = filtered.filter(m => m.status === statusFilter.value);
  }
  
  if (tableSearch && tableSearch.value) {
    const searchTerm = tableSearch.value.toLowerCase();
    filtered = filtered.filter(m => m.url.toLowerCase().includes(searchTerm));
  }
  
  // URL별로 그룹화
  const grouped = {};
  filtered.forEach(m => {
    const key = m.url;
    if (!grouped[key]) {
      grouped[key] = {
        url: m.url,
        site_name: m.site_name,
        page_detail: m.page_detail,
        network: m.network,
        scores: [],
        fcps: [],
        lcps: [],
        tbts: [],
        latest_measured_at: m.measured_at,
        count: 0
      };
    }
    
    // 유효한 점수만 추가 (0보다 큰 값)
    if (m.performance_score > 0) {
      grouped[key].scores.push(m.performance_score);
      grouped[key].fcps.push(m.fcp);
      grouped[key].lcps.push(m.lcp);
      grouped[key].tbts.push(m.tbt);
    }
    grouped[key].count++;
    
    const currentDate = new Date(m.measured_at);
    const latestDate = new Date(grouped[key].latest_measured_at);
    
    if (currentDate > latestDate) {
      grouped[key].latest_measured_at = m.measured_at;
    }
  });
  
  const averaged = Object.values(grouped).map(data => {
    // 유효한 점수가 없으면 Failed
    if (data.scores.length === 0) {
      return {
        url: data.url,
        site_name: data.site_name,
        page_detail: data.page_detail,
        network: data.network,
        avg_score: 0,
        avg_fcp: '-',
        avg_lcp: '-',
        avg_tbt: '-',
        status: 'Failed',
        latest_measured_at: data.latest_measured_at,
        count: data.count
      };
    }

    const avg_score = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const avg_fcp = data.fcps.reduce((a, b) => a + b, 0) / data.fcps.length;
    const avg_lcp = data.lcps.reduce((a, b) => a + b, 0) / data.lcps.length;
    const avg_tbt = data.tbts.reduce((a, b) => a + b, 0) / data.tbts.length;

    let status = 'Good';
    if (avg_score < 50) status = 'Poor';
    else if (avg_score < 90) status = 'Needs Improvement';

    return {
      url: data.url,
      site_name: data.site_name,
      page_detail: data.page_detail,
      network: data.network,
      avg_score: Math.round(avg_score),
      avg_fcp: avg_fcp.toFixed(2),
      avg_lcp: avg_lcp.toFixed(2),
      avg_tbt: Math.round(avg_tbt),
      status: status,
      latest_measured_at: data.latest_measured_at,
      count: data.count
    };
  });
  
  // 측정일시 순 정렬 (오래된 순 → 최신 순, 최신이 아래)
  averaged.sort((a, b) => {
    const aDate = new Date(a.latest_measured_at);
    const bDate = new Date(b.latest_measured_at);
    return aDate - bDate;
  });
  
  if (averaged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">측정 데이터가 없습니다.</td></tr>';
    return;
  }
  
  tbody.innerHTML = averaged.map(m => `
    <tr>
      <td>${formatDateTime(m.latest_measured_at)}</td>
      <td class="url-cell" title="${m.url}">${m.url}</td>
      <td>${m.site_name || '-'}</td>
      <td>${m.page_detail || '-'}</td>
      <td>${m.avg_score || '-'}</td>
      <td><span class="status-badge status-${m.status.toLowerCase().replace(' ', '-')}">${getStatusKorean(m.status)}</span></td>
      <td>${m.avg_fcp === '-' ? '-' : m.avg_fcp + 's'}</td>
      <td>${m.avg_lcp === '-' ? '-' : m.avg_lcp + 's'}</td>
      <td>${m.avg_tbt === '-' ? '-' : m.avg_tbt + 'ms'}</td>
      <td>
        <button onclick="showDetailModal('${m.url}', '${m.network}')" class="btn btn-sm btn-primary">
          상세보기
        </button>
      </td>
      <td>${m.count}회</td>
    </tr>
  `).join('');
}

// ==================== 상세보기 모달 ====================

async function showDetailModal(url, network) {
  const modal = document.getElementById('detailModal');
  
  if (!modal) {
    console.warn('Detail modal을 찾을 수 없습니다.');
    return;
  }
  
  const history = allMeasurements.filter(m => m.url === url && m.network === network);
  
  if (history.length === 0) {
    alert('측정 이력이 없습니다.');
    return;
  }
  
  // 기본 정보 표시
  const siteName = document.getElementById('detail-site-name');
  const pageDetail = document.getElementById('detail-page-detail');
  const networkDisplay = document.getElementById('detail-network');
  const urlDisplay = document.getElementById('detail-url-display');
  
  if (siteName) siteName.textContent = history[0].site_name || '-';
  if (pageDetail) pageDetail.textContent = history[0].page_detail || '-';
  if (networkDisplay) networkDisplay.textContent = network === 'Mobile' ? '📱 Mobile' : '💻 Desktop';
  if (urlDisplay) urlDisplay.textContent = url;
  
  // 평균값 계산 및 표시
  displayDetailAverages(history);
  
  // 차트 표시
  displayDetailChart(history);
  
  // 이력 테이블 표시
  displayHistoryTable(history);
  
  // 최신 분석 표시
  displayLatestAnalysis(history);
  
  // URL 링크 설정
  const viewUrlBtn = document.getElementById('detail-view-url');
  if (viewUrlBtn) {
    viewUrlBtn.href = url;
  }
  
  modal.style.display = 'block';
}

function closeDetailModal() {
  const modal = document.getElementById('detailModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ==================== 5G 예상값 설명 모달 ====================

function show5GExplanationModal() {
  const modal = document.getElementById('explanation5GModal');
  if (modal) {
    modal.style.display = 'block';
  }
}

function close5GExplanationModal() {
  const modal = document.getElementById('explanation5GModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ==================== 상세보기 평균값 ====================

function displayDetailAverages(history) {
  const avgPerf = document.getElementById('detail-avg-perf');
  const avgFcp = document.getElementById('detail-avg-fcp');
  const avgLcp = document.getElementById('detail-avg-lcp');
  const avgTbt = document.getElementById('detail-avg-tbt');
  
  if (!avgPerf || !avgFcp || !avgLcp || !avgTbt) {
    return;
  }
  
  const validScores = history.filter(h => h.performance_score > 0);

  if (validScores.length === 0) {
    avgPerf.textContent = '-';
    avgFcp.textContent = '-';
    avgLcp.textContent = '-';
    avgTbt.textContent = '-';
    return;
  }

  // null 값 제외하고 평균 계산
  const avgScore = validScores.reduce((sum, h) => sum + h.performance_score, 0) / validScores.length;

  const validFcp = validScores.filter(h => h.fcp != null);
  const avgFcpVal = validFcp.length > 0
    ? validFcp.reduce((sum, h) => sum + h.fcp, 0) / validFcp.length
    : null;

  const validLcp = validScores.filter(h => h.lcp != null);
  const avgLcpVal = validLcp.length > 0
    ? validLcp.reduce((sum, h) => sum + h.lcp, 0) / validLcp.length
    : null;

  const validTbt = validScores.filter(h => h.tbt != null);
  const avgTbtVal = validTbt.length > 0
    ? validTbt.reduce((sum, h) => sum + h.tbt, 0) / validTbt.length
    : null;

  avgPerf.textContent = Math.round(avgScore);
  avgFcp.textContent = avgFcpVal != null ? avgFcpVal.toFixed(2) + 's' : '-';
  avgLcp.textContent = avgLcpVal != null ? avgLcpVal.toFixed(2) + 's' : '-';
  avgTbt.textContent = avgTbtVal != null ? Math.round(avgTbtVal) + 'ms' : '-';
}

// ==================== 상세 차트 ====================

function displayDetailChart(history) {
  const canvas = document.getElementById('detailChart');
  
  if (!canvas) {
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  if (window.detailChartInstance) {
    window.detailChartInstance.destroy();
  }
  
  const days180Ago = new Date();
  days180Ago.setDate(days180Ago.getDate() - 180);
  
  const recentHistory = history.filter(h => {
    const measureDate = new Date(h.measured_at);
    return measureDate >= days180Ago;
  });
  
  const sortedHistory = recentHistory.sort((a, b) => {
    const aDate = new Date(a.measured_at);
    const bDate = new Date(b.measured_at);
    return aDate - bDate;
  });
  
  const labels = sortedHistory.map(h => formatDate(h.measured_at));
  const scores = sortedHistory.map(h => h.performance_score);
  
  window.detailChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Performance Score',
        data: scores,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });
}

// ==================== 측정 이력 테이블 ====================

function displayHistoryTable(history) {
  const tbody = document.getElementById('historyTableBody');

  if (!tbody) {
    return;
  }

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">측정 이력이 없습니다.</td></tr>';
    return;
  }

  const sortedHistory = history.sort((a, b) => {
    const aDate = new Date(a.measured_at);
    const bDate = new Date(b.measured_at);
    return bDate - aDate;
  });

  tbody.innerHTML = sortedHistory.map((h, index) => {
    // performance_score가 없거나 0이면 실패 처리
    const hasValidScore = h.performance_score && h.performance_score > 0;
    const displayStatus = hasValidScore ? h.status : 'Failed';

    return `
    <tr>
      <td>${index + 1}</td>
      <td>${formatDateTime(h.measured_at)}</td>
      <td>${hasValidScore ? h.performance_score : '-'}</td>
      <td><span class="status-badge status-${displayStatus.toLowerCase().replace(' ', '-')}">${getStatusKorean(displayStatus)}</span></td>
      <td>${hasValidScore && h.fcp != null ? h.fcp.toFixed(2) + 's' : '-'}</td>
      <td>${hasValidScore && h.lcp != null ? h.lcp.toFixed(2) + 's' : '-'}</td>
      <td>${hasValidScore && h.tbt != null ? Math.round(h.tbt) + 'ms' : '-'}</td>
      <td>${hasValidScore && h.speed_index != null ? h.speed_index.toFixed(2) + 's' : '-'}</td>
    </tr>
  `;
  }).join('');
}

// ==================== 최신 측정 분석 ====================

function displayLatestAnalysis(history) {
  const issuesContainer = document.getElementById('detail-issues');
  const suggestionsContainer = document.getElementById('detail-suggestions');
  
  if (!issuesContainer || !suggestionsContainer) {
    return;
  }
  
  if (history.length === 0) {
    issuesContainer.innerHTML = '<p class="text-muted">측정 이력이 없습니다.</p>';
    suggestionsContainer.innerHTML = '<p class="text-muted">측정 이력이 없습니다.</p>';
    return;
  }
  
  const sortedHistory = history.sort((a, b) => {
    const aDate = new Date(a.measured_at);
    const bDate = new Date(b.measured_at);
    return bDate - aDate;
  });
  
  const latest = sortedHistory[0];
  
  // 문제점
  if (latest.issues && latest.issues.trim()) {
    const issuesList = latest.issues.split('|').map(issue => `<li>${issue.trim()}</li>`).join('');
    issuesContainer.innerHTML = `<ul>${issuesList}</ul>`;
  } else {
    issuesContainer.innerHTML = '<p class="text-muted">데이터 없음</p>';
  }
  
  // 개선 제안
  if (latest.suggestions && latest.suggestions.trim()) {
    const suggestionsList = latest.suggestions.split('|').map(suggestion => `<li>${suggestion.trim()}</li>`).join('');
    suggestionsContainer.innerHTML = `<ul>${suggestionsList}</ul>`;
  } else {
    suggestionsContainer.innerHTML = '<p class="text-muted">데이터 없음</p>';
  }
}

// ==================== 측정 시작 ====================

async function startMeasurement(network = 'all') {
  const networkText = { 'all': '전체', 'Mobile': 'Mobile', 'Desktop': 'Desktop' };
  const text = networkText[network] || '전체';
  
  const confirmation = confirm(`${text} 성능 측정을 시작하시겠습니까?\n\n측정에는 약 4~5분이 소요됩니다.`);
  
  if (!confirmation) {
    return;
  }
  
  try {
    showLoadingModal(network);
    
    const response = await fetch(`${API_BASE}/measure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ network: network })
    });
    
    if (!response.ok) {
      throw new Error('측정 시작에 실패했습니다.');
    }
    
    const result = await response.json();
    console.log('측정 시작:', result);
    
    monitorMeasurementProgress(result.totalUrls);
    
  } catch (error) {
    console.error('측정 시작 실패:', error);
    hideLoadingModal();
    alert('측정 시작에 실패했습니다: ' + error.message);
  }
}

// ==================== 측정 진행 상황 모니터링 ====================

async function monitorMeasurementProgress(totalUrls) {
  const loadingTotal = document.getElementById('loadingTotal');
  if (loadingTotal) {
    loadingTotal.textContent = totalUrls;
  }
  
  let errorShown = false;
  let noProgressCount = 0;
  
  measurementCheckInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE}/measurement-status`, {
        headers: getAuthHeaders()
      });
      const status = await response.json();
      
      console.log('측정 상태:', status);
      
      if (status.completed > 0 || status.failed > 0) {
        updateLoadingProgress(
          status.completed, 
          status.total,
          status.failed > 0 
            ? `완료: ${status.completed}, 실패: ${status.failed}` 
            : `완료: ${status.completed}/${status.total}`
        );
        noProgressCount = 0;
      } else {
        noProgressCount++;
      }
      
      const totalProcessed = status.completed + status.failed;
      const isFinished = !status.isRunning && totalProcessed >= status.total && totalProcessed > 0;
      
      if (isFinished) {
        clearInterval(measurementCheckInterval);
        
        const loadingTitle = document.getElementById('loadingTitle');
        const loadingMessage = document.getElementById('loadingMessage');
        
        if (status.failed > 0) {
          if (loadingTitle) {
            loadingTitle.textContent = status.completed > 0 ? '⚠️ 측정 완료 (일부 실패)' : '❌ 측정 실패';
          }
          if (loadingMessage) {
            loadingMessage.textContent = `성공: ${status.completed}개, 실패: ${status.failed}개`;
          }
        } else {
          if (loadingTitle) loadingTitle.textContent = '✅ 측정 완료!';
          if (loadingMessage) loadingMessage.textContent = '모든 URL 측정 완료';
        }
        
        setTimeout(() => {
          hideLoadingModal();
          loadDashboard();
          
          if (status.failed > 0) {
            if (status.completed > 0) {
              alert(`⚠️ 측정 완료\n성공: ${status.completed}개\n실패: ${status.failed}개\n\n서버 콘솔에서 실패 원인을 확인하세요.`);
            } else {
              alert(`❌ 모든 측정 실패\n실패: ${status.failed}개\n\n서버 콘솔을 확인해주세요.`);
            }
          } else {
            alert(`✅ ${status.completed}개 URL 측정 완료!`);
          }
        }, 1500);
      }
      
      if (noProgressCount >= 150) {
        clearInterval(measurementCheckInterval);
        
        const loadingTitle = document.getElementById('loadingTitle');
        const loadingMessage = document.getElementById('loadingMessage');
        const currentUrl = document.getElementById('currentUrl');
        
        if (loadingTitle) loadingTitle.textContent = '⏱️ 진행 상황 타임아웃';
        if (loadingMessage) loadingMessage.textContent = '측정이 백그라운드에서 계속 진행 중입니다.';
        if (currentUrl) currentUrl.textContent = '서버 콘솔을 확인하거나 잠시 후 새로고침하세요.';
        
        setTimeout(() => {
          hideLoadingModal();
          alert('⏱️ 진행 상황 확인 타임아웃 (5분)\n\n측정은 백그라운드에서 계속 진행됩니다.\n서버 콘솔을 확인하거나 잠시 후 대시보드를 새로고침하세요.');
          loadDashboard();
        }, 2000);
      }
      
    } catch (error) {
      console.error('진행 상황 확인 실패:', error);
      
      if (!errorShown) {
        errorShown = true;
        clearInterval(measurementCheckInterval);
        
        const loadingTitle = document.getElementById('loadingTitle');
        const loadingMessage = document.getElementById('loadingMessage');
        const currentUrl = document.getElementById('currentUrl');
        
        if (loadingTitle) loadingTitle.textContent = '❌ 오류 발생';
        if (loadingMessage) loadingMessage.textContent = '측정 중 오류가 발생했습니다.';
        if (currentUrl) currentUrl.textContent = error.message;
        
        setTimeout(() => {
          hideLoadingModal();
          alert('❌ 측정 중 오류가 발생했습니다.\n서버 콘솔을 확인해주세요.');
          loadDashboard();
        }, 2000);
      }
    }
  }, 2000);
  
  setTimeout(() => {
    if (measurementCheckInterval) {
      clearInterval(measurementCheckInterval);
      hideLoadingModal();
      alert('⏱️ 전체 타임아웃 (3시간)\n\n측정은 백그라운드에서 계속 진행됩니다.\n서버 콘솔을 확인하거나 잠시 후 대시보드를 새로고침하세요.');
      loadDashboard();
    }
  }, 10800000);
}

// ==================== 로딩 모달 ====================

function showLoadingModal(network = 'all') {
  const modal = document.getElementById('loadingModal');
  if (!modal) return;
  
  const networkText = { 'all': '전체', 'Mobile': 'Mobile', 'Desktop': 'Desktop' };
  const text = networkText[network] || '전체';
  
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingMessage = document.getElementById('loadingMessage');
  const currentUrl = document.getElementById('currentUrl');
  const loadingProgress = document.getElementById('loadingProgress');
  const loadingProgressBar = document.getElementById('loadingProgressBar');
  
  if (loadingTitle) loadingTitle.textContent = `⏳ ${text} 성능 측정 중...`;
  if (loadingMessage) loadingMessage.textContent = '측정을 시작하고 있습니다...';
  if (currentUrl) currentUrl.textContent = '';
  if (loadingProgress) loadingProgress.textContent = '0';
  if (loadingProgressBar) loadingProgressBar.style.width = '0%';
  
  modal.style.display = 'block';
}

function hideLoadingModal() {
  const modal = document.getElementById('loadingModal');
  if (modal) {
    modal.style.display = 'none';
  }
  if (measurementCheckInterval) {
    clearInterval(measurementCheckInterval);
    measurementCheckInterval = null;
  }
}

function updateLoadingProgress(completed, total, message) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  
  const loadingProgress = document.getElementById('loadingProgress');
  const loadingProgressBar = document.getElementById('loadingProgressBar');
  
  if (loadingProgress) loadingProgress.textContent = completed;
  if (loadingProgressBar) loadingProgressBar.style.width = percentage + '%';
}

// ==================== 로딩 표시 ====================

function showLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = 'flex';
  }
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = 'none';
  }
}

// ==================== 유틸리티 함수 ====================

function scrollToResults() {
  const section = document.getElementById('resultsSection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
  }
}

function downloadCSV() {
  alert('CSV 다운로드 기능은 구현 예정입니다.');
}

function clearAllMeasurements() {
  const confirmation = confirm('⚠️ 모든 측정 결과를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.');
  
  if (!confirmation) {
    return;
  }
  
  alert('측정 결과 초기화 기능은 구현 예정입니다.');
}

// ==================== 개선사항 Report 모달 ====================

async function showImprovementReportModal() {
  const modal = document.getElementById('improvementReportModal');
  const body = document.getElementById('improvementReportBody');
  const dateRange = document.getElementById('reportDateRange');

  if (!modal) return;

  modal.style.display = 'flex';

  // 로딩 표시
  body.innerHTML = `
    <div class="report-loading">
      <div class="spinner"></div>
      <p>개선사항을 분석하고 있습니다...</p>
    </div>
  `;

  try {
    const token = Auth.getToken();
    const response = await fetch('/api/improvement-report', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('개선사항 Report 조회 실패');
    }

    const data = await response.json();

    // 날짜 범위 표시
    if (dateRange && data.dateRange) {
      const start = new Date(data.dateRange.start);
      const end = new Date(data.dateRange.end);
      dateRange.textContent = `${start.getMonth() + 1}/${start.getDate()} ~ ${end.getMonth() + 1}/${end.getDate()} (최근 20일)`;
    }

    // 데이터 없음
    if (!data.issues || data.issues.length === 0) {
      body.innerHTML = `
        <div class="no-issues">
          <div class="no-issues-icon">📊</div>
          <p>최근 20일간 수집된 개선사항이 없습니다.</p>
          <p style="font-size: 0.9em; color: #aaa;">성능 측정을 실행하면 개선사항이 수집됩니다.</p>
        </div>
      `;
      return;
    }

    // 순위외 항목이 있는지 확인
    const hasOutOfRank = data.outOfRankIssues && data.outOfRankIssues.length > 0;

    // 테이블 생성
    body.innerHTML = `
      <table class="improvement-table">
        <thead>
          <tr>
            <th>순위</th>
            <th class="issue-col">문제점</th>
            <th>영역</th>
            <th class="solution-cell">개선제안</th>
          </tr>
        </thead>
        <tbody>
          ${data.issues.map(issue => renderIssueRow(issue)).join('')}
          ${hasOutOfRank ? `
            <tr class="out-of-rank-separator">
              <td colspan="4">
                <div class="separator-line"></div>
                <span class="separator-text">📁 이전에 개선안을 생성했던 항목 (현재 순위권 외)</span>
              </td>
            </tr>
            ${data.outOfRankIssues.map(issue => renderIssueRow(issue)).join('')}
          ` : ''}
        </tbody>
      </table>
    `;

  } catch (error) {
    console.error('개선사항 Report 조회 실패:', error);
    body.innerHTML = `
      <div class="no-issues">
        <div class="no-issues-icon">⚠️</div>
        <p>개선사항을 불러오는데 실패했습니다.</p>
        <p style="font-size: 0.9em; color: #aaa;">${error.message}</p>
      </div>
    `;
  }
}

function renderIssueRow(issue) {
  const isOutOfRank = issue.isOutOfRank === true;
  const isTop3 = !isOutOfRank && issue.rank <= 3;
  const hasSolution = !!issue.solution;

  // 순위외 항목용 고유 ID 생성
  const rowId = isOutOfRank ? `out-${issue.title.replace(/[^a-zA-Z0-9가-힣]/g, '_').substring(0, 20)}` : issue.rank;

  // 개선제안 미리보기 (첫 100자)
  const solutionPreview = hasSolution
    ? issue.solution.substring(0, 100).replace(/[#*`]/g, '') + '...'
    : '';

  return `
    <tr class="${isOutOfRank ? 'out-of-rank-row' : ''}">
      <td style="text-align: center;">
        <span class="rank-badge ${isTop3 ? 'top3' : ''} ${isOutOfRank ? 'out-of-rank' : 'normal'}">${issue.rank}</span>
      </td>
      <td class="issue-col">
        <div class="issue-title">${issue.title}</div>
        ${isOutOfRank ? `
          <div class="issue-stats" style="color: #888;">
            <span>최근 20일간 발생 기록 없음</span>
          </div>
        ` : `
          <div class="issue-stats">
            <span class="count">${issue.count}회 발생</span> ·
            <span class="impact">총 ${issue.totalImpact}초 개선 가능</span>
          </div>
        `}
      </td>
      <td>
        <div class="page-tags-vertical">
          ${issue.pageDetails && issue.pageDetails.length > 0
            ? issue.pageDetails.map(p => `<span class="page-tag">${p}</span>`).join('')
            : '<span style="color:#888">-</span>'
          }
        </div>
      </td>
      <td class="solution-cell">
        <div class="solution-content" id="solution-${rowId}">
          ${hasSolution ? `
            <div class="solution-preview">${solutionPreview}</div>
            <div class="solution-full" id="solution-full-${rowId}">${formatSolution(issue.solution)}</div>
            <div class="solution-buttons">
              <button class="btn-expand" onclick="toggleSolution('${rowId}')">
                📖 펼치기
              </button>
              <button class="btn-regenerate" onclick="generateSolution('${rowId}', '${escapeForAttr(issue.title)}')">
                🔄 다시 답변받기
              </button>
              <button class="btn-history" onclick="showSuggestionHistory('${escapeForAttr(issue.title)}')">
                📚 이전 답변 모아보기
              </button>
            </div>
          ` : `
            <div class="solution-buttons">
              <button class="btn-generate" onclick="generateSolution('${rowId}', '${escapeForAttr(issue.title)}')">
                ✨ AI 개선안 생성
              </button>
            </div>
          `}
        </div>
      </td>
    </tr>
  `;
}

function formatSolution(solution) {
  if (!solution) return '';

  // HTML 특수문자 이스케이프 (XSS 방지 및 HTML 구조 보호)
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // 먼저 HTML 이스케이프 처리
  let escaped = escapeHtml(solution);

  // 마크다운 간단 변환
  return escaped
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function escapeForAttr(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function toggleSolution(rank) {
  const fullDiv = document.getElementById(`solution-full-${rank}`);
  const btn = document.querySelector(`#solution-${rank} .btn-expand`);

  if (fullDiv.classList.contains('show')) {
    fullDiv.classList.remove('show');
    btn.innerHTML = '📖 펼치기';
  } else {
    fullDiv.classList.add('show');
    btn.innerHTML = '📕 접기';
  }
}

async function copySolution(rank, solution) {
  try {
    // 이스케이프 복원
    const decoded = solution
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    await navigator.clipboard.writeText(decoded);

    const btn = document.querySelector(`#solution-${rank} .btn-copy`);
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ 복사됨!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  } catch (error) {
    console.error('복사 실패:', error);
    alert('복사에 실패했습니다.');
  }
}

async function generateSolution(rank, issueTitle) {
  const container = document.getElementById(`solution-${rank}`);

  // 로딩 표시
  container.innerHTML = `
    <div class="generating">
      <div class="mini-spinner"></div>
      AI가 개선안을 생성하고 있습니다...
    </div>
  `;

  try {
    const token = Auth.getToken();
    const response = await fetch('/api/generate-solution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ issueTitle })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '개선안 생성 실패');
    }

    const data = await response.json();
    const solution = data.solution;
    const solutionPreview = solution.substring(0, 100).replace(/[#*`]/g, '') + '...';

    container.innerHTML = `
      <div class="solution-preview">${solutionPreview}</div>
      <div class="solution-full show" id="solution-full-${rank}">${formatSolution(solution)}</div>
      <div class="solution-buttons">
        <button class="btn-expand" onclick="toggleSolution(${rank})">
          📕 접기
        </button>
        <button class="btn-regenerate" onclick="generateSolution(${rank}, '${escapeForAttr(issueTitle)}')">
          🔄 다시 답변받기
        </button>
        <button class="btn-history" onclick="showSuggestionHistory('${escapeForAttr(issueTitle)}')">
          📚 이전 답변 모아보기
        </button>
      </div>
    `;

  } catch (error) {
    console.error('개선안 생성 실패:', error);
    container.innerHTML = `
      <div style="color: #dc3545; font-size: 0.85em;">
        ⚠️ ${error.message}
      </div>
      <div class="solution-buttons" style="margin-top: 8px;">
        <button class="btn-generate" onclick="generateSolution(${rank}, '${escapeForAttr(issueTitle)}')">
          🔄 다시 시도
        </button>
      </div>
    `;
  }
}

function closeImprovementReportModal() {
  const modal = document.getElementById('improvementReportModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ==================== 이전 답변 모아보기 ====================

async function showSuggestionHistory(issueTitle) {
  const modal = document.getElementById('suggestionHistoryModal');
  const body = document.getElementById('suggestionHistoryBody');
  const titleEl = document.getElementById('historyIssueTitle');

  if (!modal) return;

  modal.style.display = 'flex';
  titleEl.textContent = issueTitle;

  // 로딩 표시
  body.innerHTML = `
    <div class="report-loading">
      <div class="spinner"></div>
      <p>이전 답변을 불러오는 중...</p>
    </div>
  `;

  try {
    const token = Auth.getToken();
    const response = await fetch(`/api/suggestion-history?issueKey=${encodeURIComponent(issueTitle)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('이전 답변 조회 실패');
    }

    const data = await response.json();

    if (!data.history || data.history.length === 0) {
      body.innerHTML = `
        <div class="no-issues">
          <div class="no-issues-icon">📭</div>
          <p>이전에 생성된 답변이 없습니다.</p>
          <p style="font-size: 0.9em; color: #aaa;">'다시 답변받기'를 클릭하면 새로운 답변이 기록됩니다.</p>
        </div>
      `;
      return;
    }

    // 히스토리 목록 렌더링
    body.innerHTML = `
      <div class="history-list">
        ${data.history.map((item, index) => renderHistoryItem(item, index)).join('')}
      </div>
    `;

  } catch (error) {
    console.error('이전 답변 조회 실패:', error);
    body.innerHTML = `
      <div class="no-issues">
        <div class="no-issues-icon">⚠️</div>
        <p>이전 답변을 불러오는데 실패했습니다.</p>
        <p style="font-size: 0.9em; color: #aaa;">${error.message}</p>
      </div>
    `;
  }
}

function renderHistoryItem(item, index) {
  const date = new Date(item.created_at);
  const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  const formattedDate = `${koreaDate.getUTCFullYear()}-${String(koreaDate.getUTCMonth() + 1).padStart(2, '0')}-${String(koreaDate.getUTCDate()).padStart(2, '0')} ${String(koreaDate.getUTCHours()).padStart(2, '0')}:${String(koreaDate.getUTCMinutes()).padStart(2, '0')}`;

  // 미리보기: 첫 150자
  const preview = item.solution
    ? item.solution.substring(0, 150).replace(/[#*`]/g, '').replace(/\n/g, ' ') + '...'
    : '';

  return `
    <div class="history-item" id="history-item-${index}">
      <div class="history-item-header" onclick="toggleHistoryItem(${index})">
        <div class="history-item-info">
          <span class="history-date">📅 ${formattedDate}</span>
          <span class="history-number">#${index + 1}</span>
        </div>
        <div class="history-preview">${preview}</div>
        <button class="history-toggle-btn" id="history-toggle-btn-${index}">▼ 펼치기</button>
      </div>
      <div class="history-item-content" id="history-content-${index}">
        ${formatSolution(item.solution)}
      </div>
    </div>
  `;
}

function toggleHistoryItem(index) {
  const content = document.getElementById(`history-content-${index}`);
  const btn = document.getElementById(`history-toggle-btn-${index}`);

  if (content.classList.contains('show')) {
    content.classList.remove('show');
    btn.innerHTML = '▼ 펼치기';
  } else {
    content.classList.add('show');
    btn.innerHTML = '▲ 접기';
  }
}

function closeSuggestionHistoryModal() {
  const modal = document.getElementById('suggestionHistoryModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ==================== 모달 외부 클릭 ====================

window.onclick = function(event) {
  const detailModal = document.getElementById('detailModal');
  const improvementReportModal = document.getElementById('improvementReportModal');
  const suggestionHistoryModal = document.getElementById('suggestionHistoryModal');

  if (event.target === detailModal) {
    detailModal.style.display = 'none';
  }

  if (event.target === improvementReportModal) {
    improvementReportModal.style.display = 'none';
  }

  if (event.target === suggestionHistoryModal) {
    suggestionHistoryModal.style.display = 'none';
  }

  // loadingModal은 외부 클릭으로 닫히지 않음
}

// ==================== 접속 기록 (관리자 전용) ====================

async function showLoginHistory() {
  const modal = document.getElementById('loginHistoryModal');
  const tbody = document.getElementById('loginHistoryBody');

  modal.style.display = 'flex';
  tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center;">로딩 중...</td></tr>';

  try {
    const history = await Auth.getLoginHistory();

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center;">접속 기록이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(item => {
      const loginTime = new Date(item.login_at);
      const koreaTime = new Date(loginTime.getTime() + (9 * 60 * 60 * 1000));
      const formatted = `${koreaTime.getUTCFullYear()}-${String(koreaTime.getUTCMonth() + 1).padStart(2, '0')}-${String(koreaTime.getUTCDate()).padStart(2, '0')} ${String(koreaTime.getUTCHours()).padStart(2, '0')}:${String(koreaTime.getUTCMinutes()).padStart(2, '0')}`;

      return `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.email}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${formatted}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.ip_address || '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('접속 기록 조회 실패:', error);
    tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: red;">접속 기록 조회에 실패했습니다.</td></tr>';
  }
}

function closeLoginHistoryModal() {
  document.getElementById('loginHistoryModal').style.display = 'none';
}

// ==================== 페이지상세별 성능 평균 비교 ====================

function renderPageComparison(measurements) {
  const container = document.getElementById('pageComparisonContainer');
  if (!container) return;

  // 최근 1일 데이터만 필터링 (한국 시간 기준)
  const validMeasurements = measurements.filter(m => m.measured_at);
  if (validMeasurements.length === 0) {
    container.innerHTML = '<div class="no-data-msg">데이터가 없습니다.</div>';
    return;
  }

  // 한국 시간 기준 날짜 문자열 반환 함수
  const getKoreaDateStr = (dateStr) => {
    const date = new Date(dateStr);
    const koreaDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return koreaDate.toISOString().split('T')[0]; // YYYY-MM-DD (KST)
  };

  // 가장 최근 측정일 찾기 (한국 시간 기준)
  const latestTimestamp = Math.max(...validMeasurements.map(m => new Date(m.measured_at).getTime()));
  const latestDateStr = getKoreaDateStr(new Date(latestTimestamp).toISOString());

  // 최근 1일 데이터만 필터링
  const recentMeasurements = validMeasurements.filter(m => {
    return getKoreaDateStr(m.measured_at) === latestDateStr;
  });

  // 페이지상세 순서 정의 (홈 / 상품목록 / 상품상세)
  const pageDetailOrder = ['홈', '상품목록', '상품상세'];

  // 모바일/데스크탑 데이터 분리
  const mobileData = recentMeasurements.filter(m => m.network === 'Mobile');
  const desktopData = recentMeasurements.filter(m => m.network === 'Desktop');

  // 5G 예상값 계산
  const mobile5GData = convertTo5G(mobileData);

  // 페이지상세별로 데이터 그룹화
  const pageDetailStats = {};

  // 모든 페이지상세 수집
  const allPageDetails = new Set([
    ...mobileData.map(m => m.page_detail),
    ...desktopData.map(m => m.page_detail)
  ].filter(Boolean));

  // 정의된 순서대로 정렬, 나머지는 알파벳순
  const sortedPageDetails = [...allPageDetails].sort((a, b) => {
    const aIdx = pageDetailOrder.indexOf(a);
    const bIdx = pageDetailOrder.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });

  // 각 페이지상세별 통계 계산
  sortedPageDetails.forEach(pageDetail => {
    const mobileMeasurements = mobileData.filter(m => m.page_detail === pageDetail);
    const mobile5GMeasurements = mobile5GData.filter(m => m.page_detail === pageDetail);
    const desktopMeasurements = desktopData.filter(m => m.page_detail === pageDetail);

    pageDetailStats[pageDetail] = {
      mobile: calculateNetworkStats(mobileMeasurements),
      mobile5G: calculateNetworkStats(mobile5GMeasurements),
      desktop: calculateNetworkStats(desktopMeasurements)
    };
  });

  // HTML 렌더링
  if (sortedPageDetails.length === 0) {
    container.innerHTML = '<div class="no-data-msg">데이터가 없습니다.</div>';
    return;
  }

  container.innerHTML = sortedPageDetails.map(pageDetail => {
    const stats = pageDetailStats[pageDetail];
    return renderPageTypeCard(pageDetail, stats);
  }).join('');
}

function calculateNetworkStats(measurements) {
  if (!measurements || measurements.length === 0) {
    return { avg: null, top3: [], bottom3: [] };
  }

  // 사이트명별 평균 계산
  const siteStats = {};
  measurements.forEach(m => {
    const siteName = m.site_name || '(이름없음)';
    if (!siteStats[siteName]) {
      siteStats[siteName] = { scores: [], url: m.url };
    }
    if (m.performance_score > 0) {
      siteStats[siteName].scores.push(m.performance_score);
    }
  });

  // 사이트별 평균 점수 계산
  const siteAvgList = Object.entries(siteStats)
    .map(([name, data]) => ({
      name,
      url: data.url,
      avgScore: data.scores.length > 0
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : 0
    }))
    .filter(s => s.avgScore > 0)
    .sort((a, b) => b.avgScore - a.avgScore);

  // 전체 평균
  const allScores = measurements.map(m => m.performance_score).filter(s => s > 0);
  const avg = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;

  return {
    avg,
    top3: siteAvgList.slice(0, 3),
    bottom3: siteAvgList.slice(-3).reverse()
  };
}

function renderPageTypeCard(pageDetail, stats) {
  const mobileAvg = stats.mobile.avg;
  const mobile5GAvg = stats.mobile5G.avg;
  const desktopAvg = stats.desktop.avg;

  return `
    <div class="page-type-card">
      <div class="page-type-header">
        <h3>${pageDetail}</h3>
      </div>

      <!-- 점수 카드 -->
      <div class="score-cards-row">
        ${renderScoreCard('📱 모바일', mobileAvg, 'Slow 4G')}
        ${renderScoreCard('📱 모바일 5G', mobile5GAvg, '5G 예상')}
        ${renderScoreCard('💻 데스크탑', desktopAvg, 'Cable 100Mbps')}
      </div>

      <!-- 사이트 랭킹 -->
      <div class="site-rankings">
        <div class="ranking-column mobile">
          <h4>📱 모바일</h4>
          ${renderRankingGroup('good', stats.mobile.top3)}
          ${renderRankingGroup('poor', stats.mobile.bottom3)}
        </div>
        <div class="ranking-column desktop">
          <h4>💻 데스크탑</h4>
          ${renderRankingGroup('good', stats.desktop.top3)}
          ${renderRankingGroup('poor', stats.desktop.bottom3)}
        </div>
      </div>
    </div>
  `;
}

function renderScoreCard(label, score, sublabel) {
  const scoreClass = getScoreClass(score);
  const bgClass = getScoreBgClass(score);
  const displayScore = score !== null ? score : '-';

  return `
    <div class="score-card ${bgClass}">
      <div class="score-card-header">${label}</div>
      <div class="score-card-value ${scoreClass}">${displayScore}</div>
      <div class="score-card-label">${sublabel}</div>
    </div>
  `;
}

function renderRankingGroup(type, sites) {
  const isGood = type === 'good';
  const label = isGood ? '🏆 우수' : '⚠️ 개선필요';

  if (!sites || sites.length === 0) {
    return `
      <div class="ranking-group">
        <div class="ranking-label ${type}">${label}</div>
        <div class="ranking-sites">
          <span class="no-data-msg">데이터 없음</span>
        </div>
      </div>
    `;
  }

  const badges = sites.map(site => `
    <a href="${site.url}" target="_blank" class="site-badge ${type}" title="${site.url}">
      ${site.name}
      <span class="site-score">(${site.avgScore})</span>
    </a>
  `).join('');

  return `
    <div class="ranking-group">
      <div class="ranking-label ${type}">${label}</div>
      <div class="ranking-sites">${badges}</div>
    </div>
  `;
}

function getScoreClass(score) {
  if (score === null) return '';
  if (score >= 90) return 'score-good';
  if (score >= 50) return 'score-warning';
  return 'score-poor';
}

function getScoreBgClass(score) {
  if (score === null) return '';
  if (score >= 90) return 'score-bg-good';
  if (score >= 50) return 'score-bg-warning';
  return 'score-bg-poor';
}

// ==================== 초기화 ====================

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();

  // 관리자면 접속기록 버튼 표시
  if (Auth.isAdmin()) {
    const btn = document.getElementById('loginHistoryBtn');
    if (btn) btn.style.display = 'inline-block';
  }

  // vercel.app에서는 측정 버튼 숨기기 (로컬 백엔드 필요)
  if (window.location.hostname.includes('vercel.app')) {
    const measureButtons = document.getElementById('measureButtons');
    if (measureButtons) measureButtons.style.display = 'none';
  }

  // changbok.lee@imweb.me로 로그인한 경우에만 관리 버튼 표시
  const currentEmail = Auth.getEmail();
  if (currentEmail === 'changbok.lee@imweb.me') {
    const btnRefresh = document.getElementById('btnRefresh');
    const btnDownloadCSV = document.getElementById('btnDownloadCSV');
    const btnClearAll = document.getElementById('btnClearAll');
    if (btnRefresh) btnRefresh.style.display = 'inline-block';
    if (btnDownloadCSV) btnDownloadCSV.style.display = 'inline-block';
    if (btnClearAll) btnClearAll.style.display = 'inline-block';
  }
});