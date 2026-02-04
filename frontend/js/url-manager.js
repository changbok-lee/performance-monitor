// auth.js에서 API_BASE, getAuthHeaders 사용

let parsedData = [];
let allUrlData = [];

// ==================== 엑셀 데이터 파싱 ====================

function parseExcelData() {
  const textarea = document.getElementById('pasteArea');
  const text = textarea.value.trim();

  if (!text) {
    alert('붙여넣을 데이터가 없습니다.');
    return;
  }

  const lines = text.split('\n');
  parsedData = [];
  const errors = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return; // 빈 줄 무시

    // 탭(\t)으로 구분된 데이터 파싱
    const parts = line.split('\t');
    
    if (parts.length < 4) {
      errors.push(`${index + 1}번째 줄: 열이 부족합니다 (4개 필요)`);
      return;
    }

    const [url, siteName, pageDetail, network] = parts.map(p => p.trim());

    // 유효성 검사
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      errors.push(`${index + 1}번째 줄: URL 형식 오류 (${url})`);
      return;
    }

    if (network !== 'Mobile' && network !== 'Desktop') {
      errors.push(`${index + 1}번째 줄: 네트워크는 Mobile 또는 Desktop이어야 합니다 (${network})`);
      return;
    }

    parsedData.push({ url, site_name: siteName, page_detail: pageDetail, network });
  });

  // 결과 표시
  showValidationResult(parsedData.length, errors);
}

// ==================== 검증 결과 표시 ====================

function showValidationResult(successCount, errors) {
  const resultDiv = document.getElementById('validationResult');
  const summaryDiv = document.getElementById('validationSummary');
  const detailsDiv = document.getElementById('validationDetails');

  // 요약
  summaryDiv.innerHTML = `
    <div class="summary">
      <div class="summary-item success">
        <span class="label">✅ 정상:</span>
        <span class="value">${successCount}개</span>
      </div>
      <div class="summary-item error">
        <span class="label">❌ 오류:</span>
        <span class="value">${errors.length}개</span>
      </div>
    </div>
  `;

  // 오류 상세
  if (errors.length > 0) {
    detailsDiv.innerHTML = `
      <div class="error-list">
        <h4>⚠️ 오류 목록:</h4>
        <ul>
          ${errors.map(err => `<li>${err}</li>`).join('')}
        </ul>
      </div>
    `;
  } else {
    detailsDiv.innerHTML = '<p class="success-msg">모든 데이터가 정상입니다!</p>';
  }

  resultDiv.style.display = 'block';
}

// ==================== URL 저장 ====================

async function saveUrls() {
  if (parsedData.length === 0) {
    alert('저장할 데이터가 없습니다.');
    return;
  }

  if (!confirm(`${parsedData.length}개의 URL을 저장하시겠습니까?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/urls/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ urls: parsedData })
    });

    const result = await response.json();

    if (result.success) {
      let message = `✅ ${result.message}`;

      // 에러 상세 내용이 있으면 표시
      if (result.results && result.results.errors && result.results.errors.length > 0) {
        message += '\n\n실패 상세:\n' + result.results.errors.slice(0, 5).join('\n');
        if (result.results.errors.length > 5) {
          message += `\n... 외 ${result.results.errors.length - 5}개`;
        }
      }

      alert(message);

      // 성공한 것이 있으면 초기화
      if (result.results && result.results.success > 0) {
        document.getElementById('pasteArea').value = '';
        document.getElementById('validationResult').style.display = 'none';
        parsedData = [];

        // URL 목록 새로고침
        loadUrls();
      }
    } else {
      alert('❌ 저장 실패: ' + result.error);
    }

  } catch (error) {
    alert('❌ 저장 중 오류 발생: ' + error.message);
  }
}

// ==================== URL 목록 불러오기 ====================

async function loadUrls() {
  const tbody = document.getElementById('urlTableBody');
  const countEl = document.getElementById('urlCount');

  // 요소가 없으면 (다른 탭에 있으면) 스킵
  if (!tbody) return;

  try {
    const response = await fetch(`${API_BASE}/urls`, {
      headers: getAuthHeaders()
    });
    const urls = await response.json();

    // API가 배열을 직접 반환하는 경우 처리
    allUrlData = Array.isArray(urls) ? urls : (urls.urls || []);

    displayUrls(allUrlData);
    if (countEl) countEl.textContent = allUrlData.length;

  } catch (error) {
    console.error('URL 목록 불러오기 실패:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;color:red;">
          ❌ 데이터 불러오기 실패
        </td>
      </tr>
    `;
  }
}

// ==================== URL 목록 표시 ====================

function displayUrls(urls) {
  const tbody = document.getElementById('urlTableBody');

  if (urls.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;">
          등록된 URL이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = urls.map(url => `
    <tr>
      <td>${url.id}</td>
      <td class="url-cell" title="${url.url}">
        <a href="${url.url}" target="_blank">${truncateUrl(url.url)}</a>
      </td>
      <td>${url.site_name || '-'}</td>
      <td>${url.page_detail || '-'}</td>
      <td>
        <span class="badge badge-${url.network.toLowerCase()}">
          ${url.network === 'Mobile' ? '📱' : '💻'} ${url.network}
        </span>
      </td>
      <td>${formatDate(url.created_at)}</td>
      <td>
        <button onclick="deleteUrl(${url.id})" class="btn-small btn-danger">
          삭제
        </button>
      </td>
    </tr>
  `).join('');
}

// ==================== URL 검색/필터 ====================

function filterUrlList() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  const searchTerm = searchInput.value.toLowerCase();
  const rows = document.querySelectorAll('#urlTableBody tr');

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

// ==================== URL 삭제 ====================

async function deleteUrl(id) {
  if (!confirm('이 URL을 삭제하시겠습니까?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/urls/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (result.success) {
      alert('✅ 삭제 완료');
      loadUrls();
    }

  } catch (error) {
    alert('❌ 삭제 실패: ' + error.message);
  }
}

// ==================== 전체 삭제 ====================

async function deleteAllUrls() {
  if (!confirm('⚠️ 모든 URL을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다!')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/urls`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();

    if (result.success) {
      alert('✅ 전체 삭제 완료');
      loadUrls();
    }

  } catch (error) {
    alert('❌ 삭제 실패: ' + error.message);
  }
}

// ==================== 유틸리티 함수 ====================

function clearPasteArea() {
  document.getElementById('pasteArea').value = '';
  document.getElementById('validationResult').style.display = 'none';
  parsedData = [];
}

function truncateUrl(url, maxLength = 50) {
  return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR');
}

// ==================== 권한 체크 및 버튼 활성화 ====================

function checkEditPermission() {
  const currentEmail = Auth.getEmail();
  const hasPermission = currentEmail === 'changbok.lee@imweb.me';

  // 비활성화할 버튼들
  const editButtons = [
    'btnValidate',
    'btnClearPaste',
    'btnSave',
    'btnRefreshUrls',
    'btnDeleteAll'
  ];

  editButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = !hasPermission;
      if (!hasPermission) {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = '편집 권한이 없습니다';
      }
    }
  });

  // textarea 비활성화
  const pasteArea = document.getElementById('pasteArea');
  if (pasteArea && !hasPermission) {
    pasteArea.disabled = true;
    pasteArea.style.opacity = '0.6';
    pasteArea.placeholder = '편집 권한이 없습니다. 조회만 가능합니다.';
  }

  // 테이블의 삭제 버튼도 비활성화 (displayUrls에서 처리)
  window.hasEditPermission = hasPermission;
}

// displayUrls 함수 오버라이드 - 삭제 버튼 권한 처리
const originalDisplayUrls = displayUrls;
displayUrls = function(urls) {
  const tbody = document.getElementById('urlTableBody');

  if (urls.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;">
          등록된 URL이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  const hasPermission = window.hasEditPermission;

  tbody.innerHTML = urls.map(url => `
    <tr>
      <td>${url.id}</td>
      <td class="url-cell" title="${url.url}">
        <a href="${url.url}" target="_blank">${truncateUrl(url.url)}</a>
      </td>
      <td>${url.site_name || '-'}</td>
      <td>${url.page_detail || '-'}</td>
      <td>
        <span class="badge badge-${url.network.toLowerCase()}">
          ${url.network === 'Mobile' ? '📱' : '💻'} ${url.network}
        </span>
      </td>
      <td>${formatDate(url.created_at)}</td>
      <td>
        <button onclick="deleteUrl(${url.id})" class="btn-small btn-danger" ${!hasPermission ? 'disabled style="opacity:0.5;cursor:not-allowed;" title="편집 권한이 없습니다"' : ''}>
          삭제
        </button>
      </td>
    </tr>
  `).join('');
};

// ==================== 페이지 초기화 ====================

document.addEventListener('DOMContentLoaded', () => {
  checkEditPermission();
  loadUrls();
});
