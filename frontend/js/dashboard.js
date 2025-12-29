const API_BASE = 'http://localhost:3000/api';

let allMeasurements = [];
let filteredAveragedData = [];
let performanceChart = null;
let currentNetworkTab = 'Mobile'; // 현재 선택된 탭

// 페이지 로드 시 대시보드 데이터 불러오기
window.addEventListener('load', () => {
  loadDashboard();
});

// ==================== 스크롤 함수 ====================

function scrollToResults() {
  document.getElementById('resultsSection').scrollIntoView({ 
    behavior: 'smooth',
    block: 'start'
  });
}

// ==================== 네트워크 탭 전환 ====================

function switchNetworkTab(network) {
  currentNetworkTab = network;
  
  // 탭 버튼 활성화 상태 변경
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.includes(network)) {
      btn.classList.add('active');
    }
  });
  
  // 필터 적용 (현재 네트워크만)
  applyFilters();
}

// ==================== 대시보드 데이터 로드 ====================

async function loadDashboard() {
  try {
    await loadStats();
    await loadMeasurements();
    await loadNetworkComparison();
  } catch (error) {
    console.error('대시보드 로드 실패:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
}

// ==================== 통계 데이터 ====================

async function loadStats() {
  const response = await fetch(`${API_BASE}/stats`);
  const stats = await response.json();

  document.getElementById('avgPerformance').textContent = 
    stats.avg_performance ? Math.round(stats.avg_performance) + '점' : '-';
  
  document.getElementById('totalUrls').textContent = 
    stats.total_urls || '0';
  
  document.getElementById('totalMeasurements').textContent = 
    stats.total_measurements || '0';
}

// ==================== 측정 결과 로드 ====================

async function loadMeasurements() {
  const response = await fetch(`${API_BASE}/measurements?limit=10000`);
  const data = await response.json();
  
  allMeasurements = data.measurements;

  calculateStatusDistribution(allMeasurements);
  displayAverageMeasurements(allMeasurements);
  drawPerformanceChart(allMeasurements);
}

// ==================== 상태별 분포 ====================

function calculateStatusDistribution(measurements) {
  if (measurements.length === 0) {
    document.getElementById('goodRate').textContent = '-';
    return;
  }

  const good = measurements.filter(m => m.performance_score >= 90).length;
  const warning = measurements.filter(m => m.performance_score >= 50 && m.performance_score < 90).length;
  const poor = measurements.filter(m => m.performance_score < 50).length;
  const total = measurements.length;

  const goodRate = Math.round((good / total) * 100);
  const warningRate = Math.round((warning / total) * 100);
  const poorRate = Math.round((poor / total) * 100);

  document.getElementById('goodRate').textContent = goodRate + '%';
  document.getElementById('goodCount').textContent = `${good}개 (${goodRate}%)`;
  document.getElementById('warningCount').textContent = `${warning}개 (${warningRate}%)`;
  document.getElementById('poorCount').textContent = `${poor}개 (${poorRate}%)`;
}

// ==================== 네트워크별 비교 ====================

async function loadNetworkComparison() {
  const mobile = allMeasurements.filter(m => m.network === 'Mobile');
  const desktop = allMeasurements.filter(m => m.network === 'Desktop');

  if (mobile.length > 0) {
    const mobileAvg = {
      perf: Math.round(mobile.reduce((sum, m) => sum + m.performance_score, 0) / mobile.length),
      fcp: (mobile.reduce((sum, m) => sum + m.fcp, 0) / mobile.length).toFixed(2),
      lcp: (mobile.reduce((sum, m) => sum + m.lcp, 0) / mobile.length).toFixed(2)
    };

    document.getElementById('mobilePerf').textContent = mobileAvg.perf + '점';
    document.getElementById('mobileFcp').textContent = mobileAvg.fcp + '초';
    document.getElementById('mobileLcp').textContent = mobileAvg.lcp + '초';
  }

  if (desktop.length > 0) {
    const desktopAvg = {
      perf: Math.round(desktop.reduce((sum, m) => sum + m.performance_score, 0) / desktop.length),
      fcp: (desktop.reduce((sum, m) => sum + m.fcp, 0) / desktop.length).toFixed(2),
      lcp: (desktop.reduce((sum, m) => sum + m.lcp, 0) / desktop.length).toFixed(2)
    };

    document.getElementById('desktopPerf').textContent = desktopAvg.perf + '점';
    document.getElementById('desktopFcp').textContent = desktopAvg.fcp + '초';
    document.getElementById('desktopLcp').textContent = desktopAvg.lcp + '초';
  }
}

// ==================== 차트 그리기 (180일, Mobile/Desktop 분리) ====================

function drawPerformanceChart(measurements) {
  if (measurements.length === 0) return;

  // 180일 전 날짜 계산
  const days180Ago = new Date();
  days180Ago.setDate(days180Ago.getDate() - 180);

  // Mobile과 Desktop 분리
  const mobileMeasurements = measurements.filter(m => 
    m.network === 'Mobile' && new Date(m.measured_at) >= days180Ago
  );
  const desktopMeasurements = measurements.filter(m => 
    m.network === 'Desktop' && new Date(m.measured_at) >= days180Ago
  );

  // 날짜별 그룹화 및 평균 계산
  const mobileDataMap = {};
  const desktopDataMap = {};

  mobileMeasurements.forEach(m => {
    const measureDate = new Date(m.measured_at);
    const koreaDate = new Date(measureDate.getTime() + (9 * 60 * 60 * 1000));
    const date = koreaDate.toISOString().split('T')[0];
    
    if (!mobileDataMap[date]) {
      mobileDataMap[date] = [];
    }
    mobileDataMap[date].push(m.performance_score);
  });

  desktopMeasurements.forEach(m => {
    const measureDate = new Date(m.measured_at);
    const koreaDate = new Date(measureDate.getTime() + (9 * 60 * 60 * 1000));
    const date = koreaDate.toISOString().split('T')[0];
    
    if (!desktopDataMap[date]) {
      desktopDataMap[date] = [];
    }
    desktopDataMap[date].push(m.performance_score);
  });

  // 모든 날짜 수집 및 정렬
  const allDates = new Set([
    ...Object.keys(mobileDataMap),
    ...Object.keys(desktopDataMap)
  ]);
  const dates = Array.from(allDates).sort();

  // 날짜별 평균 계산
  const mobileAvgScores = dates.map(date => {
    if (mobileDataMap[date]) {
      const scores = mobileDataMap[date];
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return null;
  });

  const desktopAvgScores = dates.map(date => {
    if (desktopDataMap[date]) {
      const scores = desktopDataMap[date];
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return null;
  });

  if (performanceChart) {
    performanceChart.destroy();
  }

  const ctx = document.getElementById('performanceChart');
  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => {
        const [year, month, day] = d.split('-');
        return `${parseInt(month)}/${parseInt(day)}`;
      }),
      datasets: [
        {
          label: '📱 Mobile Performance',
          data: mobileAvgScores,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4,
          fill: true,
          spanGaps: true
        },
        {
          label: '💻 Desktop Performance',
          data: desktopAvgScores,
          borderColor: '#f39c12',
          backgroundColor: 'rgba(243, 156, 18, 0.1)',
          tension: 0.4,
          fill: true,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: function(context) {
              return dates[context[0].dataIndex];
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '점';
            }
          }
        }
      }
    }
  });
}

// ==================== 평균 측정 결과 표시 ====================

function displayAverageMeasurements(measurements) {
  const tbody = document.getElementById('resultsTableBody');

  if (measurements.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center;">
          측정 결과가 없습니다. URL을 등록하고 측정을 시작하세요.
        </td>
      </tr>
    `;
    return;
  }

  // URL + 네트워크별 그룹화
  const groupedData = {};
  measurements.forEach(m => {
    const key = `${m.url}|${m.network}`;
    if (!groupedData[key]) {
      groupedData[key] = {
        url: m.url,
        site_name: m.site_name,
        page_detail: m.page_detail,
        network: m.network,
        measurements: [],
        latest_measured_at: m.measured_at
      };
    }
    groupedData[key].measurements.push(m);
    if (new Date(m.measured_at) > new Date(groupedData[key].latest_measured_at)) {
      groupedData[key].latest_measured_at = m.measured_at;
    }
  });

  // 평균 계산
  const averagedData = Object.values(groupedData).map(group => {
    const count = group.measurements.length;
    const validMeasurements = group.measurements.filter(m => !m.error);
    
    if (validMeasurements.length === 0) {
      return {
        ...group,
        avg_performance: 0,
        avg_fcp: 0,
        avg_lcp: 0,
        avg_tbt: 0,
        status: 'Failed',
        count: count,
        hasError: true
      };
    }

    const avg_performance = Math.round(
      validMeasurements.reduce((sum, m) => sum + m.performance_score, 0) / validMeasurements.length
    );

    return {
      ...group,
      avg_performance: avg_performance,
      avg_fcp: (validMeasurements.reduce((sum, m) => sum + (m.fcp || 0), 0) / validMeasurements.length).toFixed(2),
      avg_lcp: (validMeasurements.reduce((sum, m) => sum + (m.lcp || 0), 0) / validMeasurements.length).toFixed(2),
      avg_tbt: Math.round(validMeasurements.reduce((sum, m) => sum + (m.tbt || 0), 0) / validMeasurements.length),
      status: getStatus(avg_performance),
      count: count,
      hasError: false
    };
  });

  // 최신 측정일시 순 정렬
  averagedData.sort((a, b) => new Date(b.latest_measured_at) - new Date(a.latest_measured_at));

  // 전역 변수에 저장
  filteredAveragedData = averagedData;

  // 필터 옵션 생성
  populateFilterOptions(averagedData);

  // 테이블 렌더링 (현재 선택된 네트워크만)
  renderTable(averagedData.filter(d => d.network === currentNetworkTab));
}


// ==================== 필터 옵션 생성 ====================

function populateFilterOptions(data) {
  // 사이트명 옵션
  const siteNames = [...new Set(data.map(d => d.site_name).filter(s => s))].sort();
  const siteNameFilter = document.getElementById('siteNameFilter');
  siteNameFilter.innerHTML = '<option value="">전체</option>' +
    siteNames.map(name => `<option value="${name}">${name}</option>`).join('');

  // 페이지상세 옵션
  const pageDetails = [...new Set(data.map(d => d.page_detail).filter(p => p))].sort();
  const pageDetailFilter = document.getElementById('pageDetailFilter');
  pageDetailFilter.innerHTML = '<option value="">전체</option>' +
    pageDetails.map(detail => `<option value="${detail}">${detail}</option>`).join('');
}

// ==================== 테이블 렌더링 ====================

function renderTable(data) {
  const tbody = document.getElementById('resultsTableBody');

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center;">
          해당 네트워크의 데이터가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.slice(0, 100).map(d => `
    <tr ${d.hasError ? 'style="background-color: #fff3cd;"' : ''}>
      <td style="white-space: nowrap;">${formatDateTime(d.latest_measured_at)}</td>
      <td class="url-cell" title="${d.url}">
        <a href="${d.url}" target="_blank">${truncateUrl(d.url, 30)}</a>
      </td>
      <td>${d.site_name || '-'}</td>
      <td>${d.page_detail || '-'}</td>
      <td>
        <span class="score score-${getScoreClass(d.avg_performance)}">
          ${d.avg_performance}
        </span>
      </td>
      <td>
        <span class="status-badge status-${d.status.toLowerCase().replace(' ', '-')}">
          ${getStatusEmoji(d.status)} ${getStatusKorean(d.status)}
        </span>
      </td>
      <td style="white-space: nowrap;">${d.avg_fcp > 0 ? d.avg_fcp + 's' : '-'}</td>
      <td style="white-space: nowrap;">${d.avg_lcp > 0 ? d.avg_lcp + 's' : '-'}</td>
      <td style="white-space: nowrap;">${d.avg_tbt > 0 ? d.avg_tbt + 'ms' : '-'}</td>
      <td>
        <button onclick="showDetailModal('${d.url}', '${d.network}')" class="btn-small btn-primary">
          상세보기
        </button>
      </td>
      <td style="text-align: center;">${d.count}회</td>
    </tr>
  `).join('');
}

// ==================== 필터 적용 ====================

function applyFilters() {
  const siteNameValue = document.getElementById('siteNameFilter').value;
  const pageDetailValue = document.getElementById('pageDetailFilter').value;
  const statusValue = document.getElementById('statusFilter').value;
  const searchValue = document.getElementById('tableSearch').value.toLowerCase();

  let filtered = filteredAveragedData;

  // 네트워크 필터 (현재 탭)
  filtered = filtered.filter(d => d.network === currentNetworkTab);

  // 사이트명 필터
  if (siteNameValue) {
    filtered = filtered.filter(d => d.site_name === siteNameValue);
  }

  // 페이지상세 필터
  if (pageDetailValue) {
    filtered = filtered.filter(d => d.page_detail === pageDetailValue);
  }

  // 상태 필터
  if (statusValue) {
    filtered = filtered.filter(d => d.status === statusValue);
  }

  // URL 검색
  if (searchValue) {
    filtered = filtered.filter(d => 
      d.url.toLowerCase().includes(searchValue)
    );
  }

  renderTable(filtered);
}

// ==================== 필터 초기화 ====================

function resetFilters() {
  document.getElementById('siteNameFilter').value = '';
  document.getElementById('pageDetailFilter').value = '';
  document.getElementById('statusFilter').value = '';
  document.getElementById('tableSearch').value = '';

  renderTable(filteredAveragedData.filter(d => d.network === currentNetworkTab));
}

// ==================== 측정 시작 (3개 버튼 대응) ====================

async function startMeasurement(network = 'all') {
  // 버튼 텍스트
  const networkText = {
    'all': '전체',
    'Mobile': 'Mobile',
    'Desktop': 'Desktop'
  };
  
  const text = networkText[network] || '전체';
  
  if (!confirm(`${text} URL의 성능 측정을 시작하시겠습니까?\n시간이 오래 걸릴 수 있습니다.`)) {
    return;
  }

  showLoadingModal();
  
  // 로딩 타이틀 변경
  document.getElementById('loadingTitle').textContent = `⏳ ${text} 성능 측정 중...`;

  try {
    const response = await fetch(`${API_BASE}/measure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ network: network })
    });

    const result = await response.json();

    if (result.success) {
      monitorMeasurementProgress(result.count);
    } else {
      hideLoadingModal();
      alert('❌ ' + result.message);
    }

  } catch (error) {
    hideLoadingModal();
    alert('❌ 측정 시작 실패: ' + error.message);
  }
}

// ... 이어서 ...

// ==================== 로딩 모달 관리 ====================

function showLoadingModal() {
  const modal = document.getElementById('loadingModal');
  modal.style.display = 'block';
  
  document.getElementById('loadingProgress').textContent = '0';
  document.getElementById('loadingProgressBar').style.width = '0%';
  document.getElementById('currentUrl').textContent = '측정 준비 중...';
}

function hideLoadingModal() {
  const modal = document.getElementById('loadingModal');
  modal.style.display = 'none';
}

function updateLoadingProgress(current, total, currentUrl = '') {
  const percentage = Math.round((current / total) * 100);
  
  document.getElementById('loadingProgress').textContent = current;
  document.getElementById('loadingTotal').textContent = total;
  document.getElementById('loadingProgressBar').style.width = percentage + '%';
  
  if (currentUrl) {
    document.getElementById('currentUrl').textContent = '현재: ' + currentUrl;
  }
}

// ==================== 측정 진행 상황 모니터링 ====================

let measurementCheckInterval = null;

async function monitorMeasurementProgress(totalUrls) {
  document.getElementById('loadingTotal').textContent = totalUrls;
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
        
        if (status.failed > 0) {
          document.getElementById('loadingTitle').textContent = 
            status.completed > 0 ? '⚠️ 측정 완료 (일부 실패)' : '❌ 측정 실패';
          document.getElementById('loadingMessage').textContent = 
            `성공: ${status.completed}개, 실패: ${status.failed}개`;
        } else {
          document.getElementById('loadingTitle').textContent = '✅ 측정 완료!';
          document.getElementById('loadingMessage').textContent = '모든 URL 측정 완료';
        }
        
        setTimeout(() => {
          hideLoadingModal();
          loadDashboard();
          
          if (status.failed > 0) {
            if (status.completed > 0) {
              alert(`⚠️ 측정 완료\n성공: ${status.completed}개\n실패: ${status.failed}개\n\n서버 콘솔에서 실패 원인을 확인하세요.`);
            } else {
              alert(`❌ 모든 측정 실패\n실패: ${status.failed}개\n\n서버 콘솔에서 실패 원인을 확인하세요.`);
            }
          } else {
            alert(`✅ ${status.completed}개 URL 측정 완료!`);
          }
        }, 1500);
      }
      
      // ⭐ 여기 수정: 15 → 150 (5분) ⭐
      if (noProgressCount >= 150) {
        clearInterval(measurementCheckInterval);
        
        document.getElementById('loadingTitle').textContent = '⏱️ 진행 상황 타임아웃';
        document.getElementById('loadingMessage').textContent = '측정이 백그라운드에서 계속 진행 중입니다.';
        document.getElementById('currentUrl').textContent = '서버 콘솔을 확인하거나 잠시 후 새로고침하세요.';
        
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
        
        document.getElementById('loadingTitle').textContent = '❌ 오류 발생';
        document.getElementById('loadingMessage').textContent = '측정 중 오류가 발생했습니다.';
        document.getElementById('currentUrl').textContent = error.message;
        
        setTimeout(() => {
          hideLoadingModal();
          alert('❌ 측정 중 오류가 발생했습니다.\n서버 콘솔을 확인해주세요.');
          loadDashboard();
        }, 2000);
      }
    }
  }, 2000);
  
  // ⭐ 여기 수정! ⭐
  setTimeout(() => {
    if (measurementCheckInterval) {
      clearInterval(measurementCheckInterval);
      hideLoadingModal();
      alert('⚠️ 측정 시간이 초과되었습니다. 대시보드를 확인해주세요.');
      loadDashboard();
    }
  }, 10800000);  // 3시간 (180분)
}

// ==================== CSV 다운로드 ====================

function downloadCSV() {
  if (allMeasurements.length === 0) {
    alert('다운로드할 데이터가 없습니다.');
    return;
  }

  let csv = '측정일시,URL,사이트명,페이지상세,네트워크,Performance,상태,FCP,LCP,TBT,Speed Index\n';

  allMeasurements.forEach(m => {
    csv += `${m.measured_at},${m.url},${m.site_name || ''},${m.page_detail || ''},${m.network},${m.performance_score},${m.status},${m.fcp},${m.lcp},${m.tbt},${m.speed_index}\n`;
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `performance_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// ==================== 측정 결과 전체 삭제 ====================

async function clearAllMeasurements() {
  if (!confirm('⚠️ 모든 측정 결과를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다!')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/measurements`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      alert('✅ 모든 측정 결과가 삭제되었습니다.');
      loadDashboard();
    } else {
      alert('❌ 삭제 실패: ' + (result.error || result.message));
    }

  } catch (error) {
    alert('❌ 삭제 중 오류 발생: ' + error.message);
  }
}

// ==================== 상세보기 모달 ====================

let detailChart = null;

function showDetailModal(url, network) {
  const history = allMeasurements.filter(m => 
    m.url === url && 
    m.network === network
  ).sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));

  if (history.length === 0) {
    alert('측정 이력이 없습니다.');
    return;
  }

  const latest = history[0];

  // 180일 전 날짜 계산
  const days180Ago = new Date();
  days180Ago.setDate(days180Ago.getDate() - 180);

  // 180일 이내 데이터만 필터링
  const recentHistory = history.filter(m => {
    const measureDate = new Date(m.measured_at);
    return measureDate >= days180Ago;
  });

  // 기본 정보 표시
  document.getElementById('detail-site-name').textContent = 
    latest.site_name || '-';
  document.getElementById('detail-page-detail').textContent = 
    latest.page_detail || '-';
  document.getElementById('detail-network').innerHTML = 
    `<span class="badge badge-${latest.network.toLowerCase()}">
      ${latest.network === 'Mobile' ? '📱' : '💻'} ${latest.network}
    </span>`;
  document.getElementById('detail-url-display').innerHTML = 
    `<a href="${latest.url}" target="_blank" title="${latest.url}">
      ${truncateUrl(latest.url, 60)}
    </a>`;

  // 평균값 계산 및 표시
  const validHistory = history.filter(m => !m.error);
  if (validHistory.length > 0) {
    const avgPerf = Math.round(validHistory.reduce((sum, m) => sum + m.performance_score, 0) / validHistory.length);
    const avgFcp = (validHistory.reduce((sum, m) => sum + (m.fcp || 0), 0) / validHistory.length).toFixed(2);
    const avgLcp = (validHistory.reduce((sum, m) => sum + (m.lcp || 0), 0) / validHistory.length).toFixed(2);
    const avgTbt = Math.round(validHistory.reduce((sum, m) => sum + (m.tbt || 0), 0) / validHistory.length);

    document.getElementById('detail-avg-perf').textContent = avgPerf + '점';
    document.getElementById('detail-avg-fcp').textContent = avgFcp + '초';
    document.getElementById('detail-avg-lcp').textContent = avgLcp + '초';
    document.getElementById('detail-avg-tbt').textContent = avgTbt + 'ms';
  }

  document.getElementById('detail-view-url').href = latest.url;

  displayHistoryTable(history);
  drawDetailChart(recentHistory);
  displayLatestAnalysis(history);

  document.getElementById('detailModal').style.display = 'block';
}

// ==================== 이력 테이블 표시 ====================

function displayHistoryTable(history) {
  const tbody = document.getElementById('historyTableBody');

  if (history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;">
          측정 이력이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = history.map((h, index) => `
    <tr ${h.error ? 'style="background-color: #fff3cd;"' : ''}>
      <td>${index + 1}</td>
      <td>${formatDateTime(h.measured_at)}</td>
      <td>
        <span class="score score-${getScoreClass(h.performance_score)}">
          ${h.performance_score}
        </span>
      </td>
      <td>
        <span class="status-badge status-${(h.status || 'failed').toLowerCase().replace(' ', '-')}">
          ${getStatusEmoji(h.status)} ${getStatusKorean(h.status || 'Failed')}
        </span>
      </td>
      <td>${h.fcp && h.fcp > 0 ? h.fcp.toFixed(2) + 's' : '-'}</td>
      <td>${h.lcp && h.lcp > 0 ? h.lcp.toFixed(2) + 's' : '-'}</td>
      <td>${h.tbt ? h.tbt + 'ms' : '-'}</td>
      <td>${h.speed_index && h.speed_index > 0 ? h.speed_index.toFixed(2) + 's' : '-'}</td>
    </tr>
  `).join('');
}

// ==================== 상세 차트 그리기 ====================

function drawDetailChart(history) {
  const sortedHistory = [...history].reverse();

  const labels = sortedHistory.map(h => 
    new Date(h.measured_at).toLocaleDateString('ko-KR', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  const performanceData = sortedHistory.map(h => h.performance_score);
  const fcpData = sortedHistory.map(h => h.fcp ? (h.fcp * 100).toFixed(0) : null);
  const lcpData = sortedHistory.map(h => h.lcp ? (h.lcp * 100).toFixed(0) : null);

  if (detailChart) {
    detailChart.destroy();
  }

  const ctx = document.getElementById('detailChart');
  detailChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Performance Score',
          data: performanceData,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'FCP (×100)',
          data: fcpData,
          borderColor: '#f39c12',
          backgroundColor: 'rgba(243, 156, 18, 0.1)',
          tension: 0.4,
          fill: false,
          yAxisID: 'y'
        },
        {
          label: 'LCP (×100)',
          data: lcpData,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.4,
          fill: false,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              
              if (context.dataset.label === 'Performance Score') {
                label += context.parsed.y + '점';
              } else if (context.dataset.label === 'FCP (×100)') {
                label += (context.parsed.y / 100).toFixed(2) + '초';
              } else if (context.dataset.label === 'LCP (×100)') {
                label += (context.parsed.y / 100).toFixed(2) + '초';
              }
              
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          max: 100,
          title: {
            display: true,
            text: '점수 / 스케일 조정된 값'
          }
        }
      }
    }
  });
}

// ==================== 최신 측정 분석 표시 ====================

function displayLatestAnalysis(history) {
  const issuesDiv = document.getElementById('detail-issues');
  const suggestionsDiv = document.getElementById('detail-suggestions');
  
  // issues가 있는 가장 최신 데이터 찾기
  const withIssues = history.find(h => h.issues && h.issues.trim());
  
  if (withIssues && withIssues.issues) {
    // 쉼표(,) 또는 파이프(|)로 분리
    const separator = withIssues.issues.includes('|') ? '|' : ',';
    const issuesList = withIssues.issues.split(separator).map(i => i.trim()).filter(i => i);
    
    issuesDiv.innerHTML = '<ul>' + 
      issuesList.map(issue => `<li>${issue}</li>`).join('') + 
      '</ul>';
  } else {
    issuesDiv.innerHTML = '<p class="text-muted">문제점 정보 없음</p>';
  }

  if (withIssues && withIssues.suggestions) {
    // 파이프(|)로 분리
    const suggestionsList = withIssues.suggestions.split('|').map(s => s.trim()).filter(s => s);
    
    suggestionsDiv.innerHTML = '<ul>' + 
      suggestionsList.map(suggestion => `<li>${suggestion}</li>`).join('') + 
      '</ul>';
  } else {
    suggestionsDiv.innerHTML = '<p class="text-muted">개선 제안 없음</p>';
  }
}

// ==================== 모달 닫기 ====================

function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
  
  if (detailChart) {
    detailChart.destroy();
    detailChart = null;
  }
}

window.onclick = function(event) {
  const detailModal = document.getElementById('detailModal');
  if (event.target === detailModal) {
    closeDetailModal();
  }
  
  const loadingModal = document.getElementById('loadingModal');
  if (event.target === loadingModal) {
    // 로딩 모달은 외부 클릭해도 안 닫힘
  }
}

// ==================== 유틸리티 함수 ====================

function truncateUrl(url, maxLength = 50) {
  return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function getScoreClass(score) {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warning';
  return 'poor';
}

function getStatus(score) {
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

function getStatusEmoji(status) {
  if (status === 'Good') return '✅';
  if (status === 'Needs Improvement') return '⚠️';
  return '❌';
}

// 상태 한글 변환 함수
function getStatusKorean(status) {
  if (status === 'Good') return '우수';
  if (status === 'Needs Improvement') return '보통';
  if (status === 'Poor') return '개선 필요';
  if (status === 'Failed') return '실패';
  return status;
}