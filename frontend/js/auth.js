// 인증 유틸리티

// API 베이스 URL (Vercel 배포 대응)
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// 토큰 키 이름
const TOKEN_KEY = 'imweb_perf_token';
const EMAIL_KEY = 'imweb_perf_email';
const ADMIN_KEY = 'imweb_perf_admin';

// 토큰 저장
function saveToken(token, email, isAdmin = false) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
  localStorage.setItem(ADMIN_KEY, isAdmin ? 'true' : 'false');
}

// 토큰 가져오기
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// 이메일 가져오기
function getEmail() {
  return localStorage.getItem(EMAIL_KEY);
}

// 토큰 삭제 (로그아웃)
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

// 관리자 여부 확인
function isAdmin() {
  return localStorage.getItem(ADMIN_KEY) === 'true';
}

// 로그인 상태 확인
function isLoggedIn() {
  return !!getToken();
}

// 인증 헤더 가져오기
function getAuthHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// 인증된 fetch 요청
async function authFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  // 401 응답 시 로그인 페이지로 이동
  if (response.status === 401) {
    clearToken();
    window.location.href = '/login.html';
    return null;
  }

  return response;
}

// 토큰 유효성 확인
async function verifyToken() {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      headers: getAuthHeaders()
    });
    return response.ok;
  } catch (error) {
    console.error('토큰 검증 실패:', error);
    return false;
  }
}

// 인증 체크 (보호된 페이지에서 사용)
async function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }

  const isValid = await verifyToken();
  if (!isValid) {
    clearToken();
    window.location.href = '/login.html';
    return false;
  }

  return true;
}

// 로그아웃
function logout() {
  clearToken();
  window.location.href = '/login.html';
}

// 접속 기록 조회 (관리자 전용)
async function getLoginHistory() {
  try {
    const response = await fetch(`${API_BASE}/login-history`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error('접속 기록 조회 실패');
    }
    return await response.json();
  } catch (error) {
    console.error('접속 기록 조회 실패:', error);
    return [];
  }
}

// 전역 객체로 export
window.Auth = {
  API_BASE,
  saveToken,
  getToken,
  getEmail,
  clearToken,
  isAdmin,
  isLoggedIn,
  getAuthHeaders,
  authFetch,
  verifyToken,
  requireAuth,
  logout,
  getLoginHistory
};
