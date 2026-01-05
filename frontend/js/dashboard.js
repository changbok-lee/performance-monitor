const API_BASE = 'http://localhost:3000/api';

let allMeasurements = [];
let currentFilter = 'all';
let currentSort = { column: 'latest', order: 'desc' };
let measurementCheckInterval = null;
let currentNetworkTab = 'Mobile';

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

  // DB에 저장된 시간은 한국시간 기준 ISO 문자열 (UTC+9)
  // UTC로 파싱하면 9시간이 더해지므로, 9시간을 빼야 실제 한국시간
  const koreaDate = new Date(date.getTime() - (9 * 60 * 60 * 1000));

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

  // 9시간을 빼서 실제 한국시간으로 변환
  const koreaDate = new Date(date.getTime() - (9 * 60 * 60 * 1000));

  const month = koreaDate.getUTCMonth() + 1;
  const day = koreaDate.getUTCDate();

  return `${month}월 ${day}일`;
}

// 한국시간으로 상세 날짜/시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
function formatDetailDateTime(isoString) {
  const date = new Date(isoString);

  // 9시간을 빼서 실제 한국시간으로 변환
  const koreaDate = new Date(date.getTime() - (9 * 60 * 60 * 1000));

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
    
    const response = await fetch(`${API_BASE}/measurements`);
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
    displayMeasurements(allMeasurements, currentNetworkTab);
    populateFilters(allMeasurements);
    
    hideLoading();
  } catch (error) {
    console.error('대시보드 로드 실패:', error);
    hideLoading();
    alert('데이터를 불러오는데 실패했습니다: ' + error.message);
  }
}

// ==================== 통합 요약 (백업 HTML ID) ====================

function displaySummary(measurements) {
  // ⭐ 백업 HTML의 실제 ID ⭐
  const avgPerf = document.getElementById('avgPerformance');
  const goodRate = document.getElementById('goodRate');
  const totalUrls = document.getElementById('totalUrls');
  const totalMeas = document.getElementById('totalMeasurements');
  
  if (!avgPerf || !goodRate || !totalUrls || !totalMeas) {
    console.warn('Summary 요소를 찾을 수 없습니다.');
    return;
  }
  
  if (measurements.length === 0) {
    avgPerf.textContent = '-';
    goodRate.textContent = '-';
    totalUrls.textContent = '-';
    totalMeas.textContent = '-';
    return;
  }
  
  const validScores = measurements.filter(m => m.performance_score > 0);
  const avgScore = validScores.reduce((sum, m) => sum + m.performance_score, 0) / validScores.length;
  const goodCount = measurements.filter(m => m.status === 'Good').length;
  const goodPercent = (goodCount / measurements.length) * 100;
  
  const uniqueUrls = [...new Set(measurements.map(m => m.url))];
  
  avgPerf.textContent = Math.round(avgScore);
  goodRate.textContent = goodPercent.toFixed(1) + '%';
  totalUrls.textContent = uniqueUrls.length;
  totalMeas.textContent = measurements.length;
}

// ==================== 상태별 분포 (백업 HTML ID) ====================

function displayStatusDistribution(measurements) {
  // ⭐ 백업 HTML의 실제 ID ⭐
  const goodCount = document.getElementById('goodCount');
  const warningCount = document.getElementById('warningCount');
  const poorCount = document.getElementById('poorCount');
  
  if (!goodCount || !warningCount || !poorCount) {
    console.warn('Status distribution 요소를 찾을 수 없습니다.');
    return;
  }
  
  const statusCounts = {
    'Good': 0,
    'Needs Improvement': 0,
    'Poor': 0
  };
  
  measurements.forEach(m => {
    if (statusCounts.hasOwnProperty(m.status)) {
      statusCounts[m.status]++;
    }
  });
  
  const total = measurements.length || 1;
  
  // ⭐ 백업 HTML 형식: "0개 (0%)" ⭐
  goodCount.textContent = `${statusCounts['Good']}개 (${((statusCounts['Good'] / total) * 100).toFixed(1)}%)`;
  warningCount.textContent = `${statusCounts['Needs Improvement']}개 (${((statusCounts['Needs Improvement'] / total) * 100).toFixed(1)}%)`;
  poorCount.textContent = `${statusCounts['Poor']}개 (${((statusCounts['Poor'] / total) * 100).toFixed(1)}%)`;
}

// ==================== 네트워크 비교 ====================

function displayNetworkComparison(measurements) {
  const mobilePerf = document.getElementById('mobilePerf');
  const mobileFcp = document.getElementById('mobileFcp');
  const mobileLcp = document.getElementById('mobileLcp');
  const desktopPerf = document.getElementById('desktopPerf');
  const desktopFcp = document.getElementById('desktopFcp');
  const desktopLcp = document.getElementById('desktopLcp');
  
  if (!mobilePerf || !mobileFcp || !mobileLcp || !desktopPerf || !desktopFcp || !desktopLcp) {
    console.warn('Network comparison 요소를 찾을 수 없습니다.');
    return;
  }
  
  const mobileData = measurements.filter(m => m.network === 'Mobile');
  const desktopData = measurements.filter(m => m.network === 'Desktop');
  
  function calculateAverage(data) {
    if (data.length === 0) return { score: 0, fcp: 0, lcp: 0 };
    const validData = data.filter(m => m.performance_score > 0);
    if (validData.length === 0) return { score: 0, fcp: 0, lcp: 0 };
    
    return {
      score: Math.round(validData.reduce((sum, m) => sum + m.performance_score, 0) / validData.length),
      fcp: (validData.reduce((sum, m) => sum + m.fcp, 0) / validData.length).toFixed(2),
      lcp: (validData.reduce((sum, m) => sum + m.lcp, 0) / validData.length).toFixed(2)
    };
  }
  
  const mobileAvg = calculateAverage(mobileData);
  const desktopAvg = calculateAverage(desktopData);
  
  mobilePerf.textContent = mobileAvg.score || '-';
  mobileFcp.textContent = mobileAvg.fcp ? mobileAvg.fcp + 's' : '-';
  mobileLcp.textContent = mobileAvg.lcp ? mobileAvg.lcp + 's' : '-';
  
  desktopPerf.textContent = desktopAvg.score || '-';
  desktopFcp.textContent = desktopAvg.fcp ? desktopAvg.fcp + 's' : '-';
  desktopLcp.textContent = desktopAvg.lcp ? desktopAvg.lcp + 's' : '-';
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
      const dateKey = date.toISOString().split('T')[0];
      
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
    
    grouped[key].scores.push(m.performance_score);
    grouped[key].fcps.push(m.fcp);
    grouped[key].lcps.push(m.lcp);
    grouped[key].tbts.push(m.tbt);
    grouped[key].count++;
    
    const currentDate = new Date(m.measured_at);
    const latestDate = new Date(grouped[key].latest_measured_at);
    
    if (currentDate > latestDate) {
      grouped[key].latest_measured_at = m.measured_at;
    }
  });
  
  const averaged = Object.values(grouped).map(data => {
    const avg_score = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const avg_fcp = data.fcps.reduce((a, b) => a + b, 0) / data.fcps.length;
    const avg_lcp = data.lcps.reduce((a, b) => a + b, 0) / data.lcps.length;
    const avg_tbt = data.tbts.reduce((a, b) => a + b, 0) / data.tbts.length;
    
    let status = 'Good';
    if (avg_score < 90) status = 'Needs Improvement';
    if (avg_score < 50) status = 'Poor';
    
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
  
  // 최신 측정일시 순 정렬
  averaged.sort((a, b) => {
    const aDate = new Date(a.latest_measured_at);
    const bDate = new Date(b.latest_measured_at);
    return bDate - aDate;
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
      <td>${m.avg_score}</td>
      <td><span class="status-badge status-${m.status.toLowerCase().replace(' ', '-')}">${getStatusKorean(m.status)}</span></td>
      <td>${m.avg_fcp}s</td>
      <td>${m.avg_lcp}s</td>
      <td>${m.avg_tbt}ms</td>
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

  tbody.innerHTML = sortedHistory.map((h, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${formatDateTime(h.measured_at)}</td>
      <td>${h.performance_score || '-'}</td>
      <td><span class="status-badge status-${h.status.toLowerCase().replace(' ', '-')}">${getStatusKorean(h.status)}</span></td>
      <td>${h.fcp != null ? h.fcp.toFixed(2) + 's' : '-'}</td>
      <td>${h.lcp != null ? h.lcp.toFixed(2) + 's' : '-'}</td>
      <td>${h.tbt != null ? Math.round(h.tbt) + 'ms' : '-'}</td>
      <td>${h.speed_index != null ? h.speed_index.toFixed(2) + 's' : '-'}</td>
    </tr>
  `).join('');
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
        'Content-Type': 'application/json'
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
      const response = await fetch(`${API_BASE}/measurement-status`);
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

// ==================== 모달 외부 클릭 ====================

window.onclick = function(event) {
  const detailModal = document.getElementById('detailModal');
  const loadingModal = document.getElementById('loadingModal');
  
  if (event.target === detailModal) {
    detailModal.style.display = 'none';
  }
  
  // loadingModal은 외부 클릭으로 닫히지 않음
}

// ==================== 초기화 ====================

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});