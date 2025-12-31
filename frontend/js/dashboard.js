const API_BASE = 'http://localhost:3000/api';

let allMeasurements = [];
let currentFilter = 'all';
let currentSort = { column: 'latest', order: 'desc' };
let measurementCheckInterval = null;

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
  const koreaDate = parseToKoreaTime(isoString);
  
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
  const koreaDate = parseToKoreaTime(isoString);
  
  const month = koreaDate.getUTCMonth() + 1;
  const day = koreaDate.getUTCDate();
  
  return `${month}월 ${day}일`;
}

// 한국시간으로 상세 날짜/시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
function formatDetailDateTime(isoString) {
  const koreaDate = parseToKoreaTime(isoString);
  
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
    
    allMeasurements = await response.json();
    
    displaySummary(allMeasurements);
    displayStatusDistribution(allMeasurements);
    displayNetworkComparison(allMeasurements);
    displayPerformanceTrend(allMeasurements);
    displayAverageMeasurements(allMeasurements, currentFilter);
    
    hideLoading();
  } catch (error) {
    console.error('대시보드 로드 실패:', error);
    hideLoading();
    alert('데이터를 불러오는데 실패했습니다.');
  }
}

// ==================== 통합 요약 ====================

function displaySummary(measurements) {
  if (measurements.length === 0) {
    document.getElementById('overallAverage').textContent = '-';
    document.getElementById('goodPercentage').textContent = '-';
    document.getElementById('totalUrls').textContent = '0';
    document.getElementById('totalMeasurements').textContent = '0';
    return;
  }
  
  const validScores = measurements.filter(m => m.performance_score > 0);
  const avgScore = validScores.reduce((sum, m) => sum + m.performance_score, 0) / validScores.length;
  const goodCount = measurements.filter(m => m.status === 'Good').length;
  const goodPercent = (goodCount / measurements.length) * 100;
  
  const uniqueUrls = [...new Set(measurements.map(m => m.url))];
  
  document.getElementById('overallAverage').textContent = Math.round(avgScore);
  document.getElementById('goodPercentage').textContent = goodPercent.toFixed(1) + '%';
  document.getElementById('totalUrls').textContent = uniqueUrls.length;
  document.getElementById('totalMeasurements').textContent = measurements.length;
}

// ==================== 상태별 분포 ====================

function displayStatusDistribution(measurements) {
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
  
  document.getElementById('goodCount').textContent = statusCounts['Good'];
  document.getElementById('goodPercent').textContent = 
    `(${((statusCounts['Good'] / total) * 100).toFixed(1)}%)`;
  
  document.getElementById('needsImprovementCount').textContent = statusCounts['Needs Improvement'];
  document.getElementById('needsImprovementPercent').textContent = 
    `(${((statusCounts['Needs Improvement'] / total) * 100).toFixed(1)}%)`;
  
  document.getElementById('poorCount').textContent = statusCounts['Poor'];
  document.getElementById('poorPercent').textContent = 
    `(${((statusCounts['Poor'] / total) * 100).toFixed(1)}%)`;
}

// ==================== 네트워크 비교 ====================

function displayNetworkComparison(measurements) {
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
  
  document.getElementById('mobilePerf').textContent = mobileAvg.score || '-';
  document.getElementById('mobileFcp').textContent = mobileAvg.fcp ? mobileAvg.fcp + 's' : '-';
  document.getElementById('mobileLcp').textContent = mobileAvg.lcp ? mobileAvg.lcp + 's' : '-';
  
  document.getElementById('desktopPerf').textContent = desktopAvg.score || '-';
  document.getElementById('desktopFcp').textContent = desktopAvg.fcp ? desktopAvg.fcp + 's' : '-';
  document.getElementById('desktopLcp').textContent = desktopAvg.lcp ? desktopAvg.lcp + 's' : '-';
}

// ==================== 성능 추이 차트 ====================

function displayPerformanceTrend(measurements) {
  const canvas = document.getElementById('trendChart');
  const ctx = canvas.getContext('2d');
  
  if (window.trendChartInstance) {
    window.trendChartInstance.destroy();
  }
  
  const days180Ago = new Date();
  days180Ago.setDate(days180Ago.getDate() - 180);
  
  const recentData = measurements.filter(m => {
    const measureDate = parseToKoreaTime(m.measured_at);
    return measureDate >= days180Ago;
  });
  
  const mobileData = recentData.filter(m => m.network === 'Mobile');
  const desktopData = recentData.filter(m => m.network === 'Desktop');
  
  function groupByDate(data) {
    const grouped = {};
    data.forEach(m => {
      const koreaDate = parseToKoreaTime(m.measured_at);
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

// ==================== URL별 평균 테이블 ====================

function displayAverageMeasurements(measurements, filter = 'all') {
  currentFilter = filter;
  
  const filteredData = filter === 'all' 
    ? measurements 
    : measurements.filter(m => m.network === filter);
  
  const groupedData = {};
  
  filteredData.forEach(m => {
    const key = `${m.url}_${m.network}`;
    
    if (!groupedData[key]) {
      groupedData[key] = {
        url: m.url,
        site_name: m.site_name,
        network: m.network,
        scores: [],
        fcps: [],
        lcps: [],
        tbts: [],
        latest_measured_at: m.measured_at,
        count: 0
      };
    }
    
    groupedData[key].scores.push(m.performance_score);
    groupedData[key].fcps.push(m.fcp);
    groupedData[key].lcps.push(m.lcp);
    groupedData[key].tbts.push(m.tbt);
    groupedData[key].count++;
    
    const currentDate = parseToKoreaTime(m.measured_at);
    const latestDate = parseToKoreaTime(groupedData[key].latest_measured_at);
    
    if (currentDate > latestDate) {
      groupedData[key].latest_measured_at = m.measured_at;
    }
  });
  
  const averagedData = Object.values(groupedData).map(data => {
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
  
  averagedData.sort((a, b) => {
    const aDate = parseToKoreaTime(a.latest_measured_at);
    const bDate = parseToKoreaTime(b.latest_measured_at);
    return bDate - aDate;
  });
  
  renderTable(averagedData);
}

function renderTable(data) {
  const tbody = document.getElementById('measurementsTable');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px;">측정 데이터가 없습니다.</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(m => `
    <tr onclick="showDetailModal('${m.url}', '${m.network}')" style="cursor: pointer;">
      <td>${formatDateTime(m.latest_measured_at)}</td>
      <td>${m.network === 'Mobile' ? '📱' : '💻'} ${m.network}</td>
      <td title="${m.url}">${m.site_name || m.url}</td>
      <td><span class="score-badge score-${m.status.toLowerCase().replace(' ', '-')}">${m.avg_score}</span></td>
      <td><span class="status-badge status-${m.status.toLowerCase().replace(' ', '-')}">${getStatusKorean(m.status)}</span></td>
      <td>${m.avg_fcp}s</td>
      <td>${m.avg_lcp}s</td>
      <td>${m.avg_tbt}ms</td>
      <td>${m.count}회</td>
    </tr>
  `).join('');
}

// ==================== 네트워크 필터 ====================

function filterByNetwork(network) {
  const buttons = document.querySelectorAll('.network-filter-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  displayAverageMeasurements(allMeasurements, network);
}

// ==================== 상세보기 모달 ====================

async function showDetailModal(url, network) {
  const modal = document.getElementById('detailModal');
  
  document.getElementById('detail-url-display').textContent = url;
  document.getElementById('detail-network-display').textContent = network === 'Mobile' ? '📱 Mobile' : '💻 Desktop';
  
  const history = allMeasurements.filter(m => m.url === url && m.network === network);
  
  if (history.length === 0) {
    alert('측정 이력이 없습니다.');
    return;
  }
  
  displayBasicInfo(history);
  displayDetailChart(history);
  displayHistoryTable(history);
  displayLatestAnalysis(history);
  
  modal.style.display = 'block';
}

function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
}

window.onclick = function(event) {
  const modal = document.getElementById('detailModal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
}

// ==================== 기본 정보 ====================

function displayBasicInfo(history) {
  const validScores = history.filter(h => h.performance_score > 0);
  
  if (validScores.length === 0) {
    document.getElementById('detail-avg-score').textContent = '-';
    document.getElementById('detail-avg-fcp').textContent = '-';
    document.getElementById('detail-avg-lcp').textContent = '-';
    document.getElementById('detail-avg-tbt').textContent = '-';
    return;
  }
  
  const avgScore = validScores.reduce((sum, h) => sum + h.performance_score, 0) / validScores.length;
  const avgFcp = validScores.reduce((sum, h) => sum + h.fcp, 0) / validScores.length;
  const avgLcp = validScores.reduce((sum, h) => sum + h.lcp, 0) / validScores.length;
  const avgTbt = validScores.reduce((sum, h) => sum + h.tbt, 0) / validScores.length;
  
  document.getElementById('detail-avg-score').textContent = Math.round(avgScore);
  document.getElementById('detail-avg-fcp').textContent = avgFcp.toFixed(2) + 's';
  document.getElementById('detail-avg-lcp').textContent = avgLcp.toFixed(2) + 's';
  document.getElementById('detail-avg-tbt').textContent = Math.round(avgTbt) + 'ms';
}

// ==================== 상세 차트 ====================

function displayDetailChart(history) {
  const canvas = document.getElementById('detailChart');
  const ctx = canvas.getContext('2d');
  
  if (window.detailChartInstance) {
    window.detailChartInstance.destroy();
  }
  
  const days180Ago = new Date();
  days180Ago.setDate(days180Ago.getDate() - 180);
  
  const recentHistory = history.filter(h => {
    const measureDate = parseToKoreaTime(h.measured_at);
    return measureDate >= days180Ago;
  });
  
  const sortedHistory = recentHistory.sort((a, b) => {
    const aDate = parseToKoreaTime(a.measured_at);
    const bDate = parseToKoreaTime(b.measured_at);
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

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">측정 이력이 없습니다.</td></tr>';
    return;
  }

  const sortedHistory = history.sort((a, b) => {
    const aDate = parseToKoreaTime(a.measured_at);
    const bDate = parseToKoreaTime(b.measured_at);
    return bDate - aDate;
  });

  tbody.innerHTML = sortedHistory.map((h, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${formatDateTime(h.measured_at)}</td>
      <td><span class="score-badge score-${h.status.toLowerCase().replace(' ', '-')}">${h.performance_score}</span></td>
      <td><span class="status-badge status-${h.status.toLowerCase().replace(' ', '-')}">${getStatusKorean(h.status)}</span></td>
      <td>${h.fcp.toFixed(2)}s</td>
      <td>${h.lcp.toFixed(2)}s</td>
      <td>${h.tbt}ms</td>
      <td>${h.speed_index ? h.speed_index.toFixed(2) + 's' : '-'}</td>
    </tr>
  `).join('');
}

// ==================== 최신 측정 분석 ====================

function displayLatestAnalysis(history) {
  const container = document.getElementById('latestAnalysis');
  
  if (history.length === 0) {
    container.innerHTML = '<p>측정 이력이 없습니다.</p>';
    return;
  }
  
  const sortedHistory = history.sort((a, b) => {
    const aDate = parseToKoreaTime(a.measured_at);
    const bDate = parseToKoreaTime(b.measured_at);
    return bDate - aDate;
  });
  
  const latest = sortedHistory[0];
  
  let html = `<h4>📅 ${formatDateTime(latest.measured_at)} 측정</h4>`;
  
  if (latest.issues && latest.issues.trim()) {
    html += `
      <div class="analysis-section">
        <h5>⚠️ 주요 문제점</h5>
        <ul>
          ${latest.issues.split('|').map(issue => `<li>${issue.trim()}</li>`).join('')}
        </ul>
      </div>
    `;
  } else {
    html += `<p>💡 문제점 정보가 없습니다.</p>`;
  }
  
  if (latest.suggestions && latest.suggestions.trim()) {
    html += `
      <div class="analysis-section">
        <h5>💡 개선 제안</h5>
        <ul>
          ${latest.suggestions.split('|').map(suggestion => `<li>${suggestion.trim()}</li>`).join('')}
        </ul>
      </div>
    `;
  } else {
    html += `<p>💡 개선 제안 정보가 없습니다.</p>`;
  }
  
  container.innerHTML = html;
}

// ==================== 측정 시작 ====================

async function startMeasurement(network = 'all') {
  const confirmation = confirm(`${network === 'all' ? '전체' : network} 성능 측정을 시작하시겠습니까?\n\n측정에는 약 4~5분이 소요됩니다.`);
  
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
              alert(`❌ 모든 측정 실패\n실패: ${status.failed}개\n\n서버 콘솔을 확인해주세요.`);
            }
          } else {
            alert(`✅ ${status.completed}개 URL 측정 완료!`);
          }
        }, 1500);
      }
      
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
  const networkText = { 'all': '전체', 'Mobile': 'Mobile', 'Desktop': 'Desktop' };
  const text = networkText[network] || '전체';
  
  document.getElementById('loadingTitle').textContent = `⏳ ${text} 성능 측정 중...`;
  document.getElementById('loadingMessage').textContent = '측정을 시작하고 있습니다...';
  document.getElementById('currentUrl').textContent = '';
  document.getElementById('loadingProgress').textContent = '준비 중...';
  document.getElementById('loadingProgressBar').style.width = '0%';
  
  document.getElementById('loadingModal').style.display = 'block';
}

function hideLoadingModal() {
  document.getElementById('loadingModal').style.display = 'none';
  if (measurementCheckInterval) {
    clearInterval(measurementCheckInterval);
    measurementCheckInterval = null;
  }
}

function updateLoadingProgress(completed, total, message) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  
  document.getElementById('loadingProgress').textContent = message || `${completed} / ${total} 완료`;
  document.getElementById('loadingProgressBar').style.width = percentage + '%';
  document.getElementById('loadingCompleted').textContent = completed;
}

// ==================== 로딩 표시 ====================

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

// ==================== 초기화 ====================

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});