/* ============================================
   AUTH.JS — Spring Boot JWT Authentication
   Plain vanilla JS for direct browser use
   ============================================ */

const API_BASE = ''
const TOKEN_KEY = 'token'
const USER_KEY = 'auth_user'

const ROLES = { ADMIN: 'ADMIN', USER: 'USER' }

// ─── Token Helpers ──────────────────────────
function parseToken(token) {
  try { const [, body] = token.split('.'); return JSON.parse(atob(body)) }
  catch { return null }
}
function isTokenExpired(token) {
  const payload = parseToken(token)
  if (!payload || !payload.exp) return true
  return Date.now() > payload.exp * 1000
}

// ─── Storage ────────────────────────────────
function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  if (user.username) localStorage.setItem('username', user.username)
  if (user.role)     localStorage.setItem('role', user.role)
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem('username')
  localStorage.removeItem('role')
}

// ─── Register ───────────────────────────────
async function registerUser(event) {
  event.preventDefault()
  console.log('[AUTH] Register submitted')

  const nameEl = document.getElementById('name')
  const userEl = document.getElementById('username')
  const passEl = document.getElementById('password')
  const msgEl  = document.getElementById('message')

  const payload = {
    name:     nameEl  ? nameEl.value.trim()  : '',
    username: userEl  ? userEl.value.trim()  : '',
    password: passEl  ? passEl.value.trim()  : '',
    role:     ROLES.USER
  }

  if (!payload.username || !payload.password) {
    if (msgEl) { msgEl.textContent = 'Please fill in all fields'; msgEl.style.color = '#C62828' }
    return
  }

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    console.log('[AUTH] Register response:', res.status, data)

    if (!res.ok) throw new Error(data.message || 'Registration failed')

    if (msgEl) { msgEl.textContent = data.message || 'Registration successful! Redirecting...'; msgEl.style.color = '#2D5016' }
    setTimeout(() => { window.location.href = '/login.html' }, 1200)

  } catch (err) {
    console.error('[AUTH] Register error:', err)
    if (msgEl) { msgEl.textContent = err.message || 'Network error.'; msgEl.style.color = '#C62828' }
  }
}

// ─── Login ──────────────────────────────────
async function loginUser(event, isAdminLogin = false) {
  // CRITICAL: stop the browser from submitting the form normally
  event.preventDefault()
  event.stopPropagation()
  console.log('[AUTH] Login submitted. isAdminLogin=', isAdminLogin)

  const usernameEl = document.getElementById('username')
  const passwordEl = document.getElementById('password')
  const loginBtn   = document.getElementById('loginBtn')
  const msgEl      = document.getElementById('message')

  const username = usernameEl ? usernameEl.value.trim() : ''
  const password = passwordEl ? passwordEl.value.trim() : ''

  if (!username || !password) {
    if (!username && usernameEl) usernameEl.closest('.form-group').classList.add('shake')
    if (!password && passwordEl) passwordEl.closest('.form-group').classList.add('shake')
    setTimeout(() => document.querySelectorAll('.shake').forEach(el => el.classList.remove('shake')), 500)
    return false
  }

  const originalBtnText = loginBtn ? loginBtn.innerHTML : ''
  if (loginBtn) { loginBtn.innerHTML = '<span>Signing in...</span>'; loginBtn.disabled = true }

  try {
    console.log('[AUTH] Fetching /auth/login...')
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json().catch(() => ({}))
    console.log('[AUTH] Login response:', res.status, data)

    if (!res.ok) throw new Error(data.message || 'Invalid credentials')

    const token = data.token || data.accessToken || data.jwt
    if (!token) throw new Error('No token received from server')

    const user = {
      username: data.username || username,
      role:     (data.role || 'USER').toUpperCase(),
      name:     data.name || username
    }

    // Admin gate
    if (isAdminLogin && user.role !== ROLES.ADMIN) {
      if (loginBtn) { loginBtn.innerHTML = originalBtnText; loginBtn.disabled = false }
      if (msgEl) { msgEl.textContent = 'Access denied. Admin privileges required.'; msgEl.style.color = '#C62828'; msgEl.classList.add('visible') }
      return false
    }

    setSession(token, user)
    console.log('[AUTH] Session stored. Redirecting...')

    if (loginBtn) {
      loginBtn.classList.add('success-pulse')
      loginBtn.innerHTML = `<span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" style="display:inline-block;vertical-align:middle;margin-right:6px;"><polyline points="20,6 9,17 4,12"/></svg>Welcome back!</span>`
      loginBtn.style.background = 'var(--green-accent)'
    }

    const redirectUrl = user.role === ROLES.ADMIN ? '/admin-home.html' : '/customer-home.html'
    setTimeout(() => { window.location.href = redirectUrl }, 1200)

  } catch (err) {
    console.error('[AUTH] Login error:', err)
    if (loginBtn) { loginBtn.innerHTML = originalBtnText; loginBtn.disabled = false }
    if (msgEl) { msgEl.textContent = err.message || 'Server error.'; msgEl.style.color = '#C62828'; msgEl.classList.add('visible') }
    if (usernameEl) usernameEl.closest('.form-group').classList.add('shake')
    if (passwordEl) passwordEl.closest('.form-group').classList.add('shake')
    setTimeout(() => document.querySelectorAll('.shake').forEach(el => el.classList.remove('shake')), 500)
  }

  return false
}

// ─── Logout ─────────────────────────────────
function logout() {
  clearSession()
  window.location.href = '/login.html'
}

// ─── Read-Only Helpers ──────────────────────
function getToken()         { return localStorage.getItem(TOKEN_KEY) }
function getCurrentUser()   { try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function isAuthenticated()  { const t = getToken(); return t ? !isTokenExpired(t) : false }
function hasRole(role)      { const u = getCurrentUser(); return u && u.role === role.toUpperCase() }
function isAdmin()          { return hasRole('ADMIN') }
function isUser()           { return hasRole('USER') }
function getAuthHeaders()   { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

// ─── Authenticated API ──────────────────────
async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(options.headers || {}) }
  })
  if (res.status === 401) { clearSession(); window.location.href = '/login.html'; throw new Error('Session expired.') }
  return res
}

// ─── Route Guards ───────────────────────────
function redirectIfLoggedIn() {
  if (!isAuthenticated()) return
  const u = getCurrentUser()
  window.location.replace(u && u.role === ROLES.ADMIN ? '/admin-home.html' : '/customer-home.html')
}
function requireAuth(allowedRoles = []) {
  if (!isAuthenticated()) { window.location.href = '/login.html'; return false }
  if (allowedRoles.length > 0) {
    const userRole = (getCurrentUser() || {}).role || ''
    if (!allowedRoles.map(r => r.toUpperCase()).includes(userRole)) {
      window.location.href = '/login.html'
      return false
    }
  }
  return true
}

// ─── Password Toggle ────────────────────────
function initPasswordToggle() {
  const toggleBtn = document.getElementById('togglePassword')
  const passwordInput = document.getElementById('password')
  const eyeIcon = document.getElementById('eyeIcon')
  if (!toggleBtn || !passwordInput || !eyeIcon) return
  toggleBtn.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'
    passwordInput.setAttribute('type', type)
    if (type === 'text') {
      eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
    } else {
      eyeIcon.innerHTML = `<path d="M1,12S5,4 12,4s11,8 11,8-4,8-11,8S1,12 1,12z"/><circle cx="12" cy="12" r="3"/>`
    }
  })
}

// ─── Auto-Init ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('[AUTH] auth.js loaded — DOM ready')

  const signupForm     = document.getElementById('signupForm')
  const loginForm      = document.getElementById('loginForm')
  const adminLoginForm = document.getElementById('adminLoginForm')

  if (signupForm)     { console.log('[AUTH] Attaching signupForm');     signupForm.addEventListener('submit', registerUser) }
  if (loginForm)      { console.log('[AUTH] Attaching loginForm');      loginForm.addEventListener('submit', (e) => loginUser(e, false)) }
  if (adminLoginForm) { console.log('[AUTH] Attaching adminLoginForm'); adminLoginForm.addEventListener('submit', (e) => loginUser(e, true)) }

  initPasswordToggle()
})