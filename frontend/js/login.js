// 로그인 페이지 스크립트

// API 베이스 URL
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// DOM 요소
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');

// 이미 로그인 되어있으면 대시보드로 이동
function checkAlreadyLoggedIn() {
  const token = localStorage.getItem('imweb_perf_token');
  if (token) {
    window.location.href = '/index.html';
  }
}

// 에러 메시지 표시
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
}

// 에러 메시지 숨김
function hideError() {
  errorMessage.classList.remove('show');
}

// 로그인 버튼 상태 변경
function setLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading ? '로그인 중...' : '로그인';
}

// 로그인 처리
async function handleLogin(e) {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // 클라이언트 측 유효성 검사
  if (!email) {
    showError('이메일을 입력해주세요.');
    emailInput.focus();
    return;
  }

  if (!email.toLowerCase().endsWith('@imweb.me')) {
    showError('@imweb.me 이메일만 사용할 수 있습니다.');
    emailInput.focus();
    return;
  }

  if (!password) {
    showError('비밀번호를 입력해주세요.');
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showError(data.error || '로그인에 실패했습니다.');
      setLoading(false);
      return;
    }

    // 토큰 저장
    localStorage.setItem('imweb_perf_token', data.token);
    localStorage.setItem('imweb_perf_email', data.email);

    // 대시보드로 이동
    window.location.href = '/index.html';

  } catch (error) {
    console.error('로그인 오류:', error);
    showError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    setLoading(false);
  }
}

// 이벤트 리스너
loginForm.addEventListener('submit', handleLogin);

// 입력 시 에러 메시지 숨김
emailInput.addEventListener('input', hideError);
passwordInput.addEventListener('input', hideError);

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  checkAlreadyLoggedIn();
  emailInput.focus();
});
