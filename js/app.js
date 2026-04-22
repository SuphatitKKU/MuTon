// ==========================================
// MuTon - แอปนับแคลอรี่
// Main Application Logic + Google Auth
// ==========================================

(function () {
  'use strict';

  // ======================
  // CONSTANTS
  // ======================
  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const THAI_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const ACTIVITY_LEVELS = [
    { value: 'sedentary', label: 'นั่งทำงาน / ไม่ค่อยออกกำลังกาย', multiplier: 1.2 },
    { value: 'light', label: 'ออกกำลังกายเบาๆ (1-3 วัน/สัปดาห์)', multiplier: 1.375 },
    { value: 'moderate', label: 'ออกกำลังกายปานกลาง (3-5 วัน/สัปดาห์)', multiplier: 1.55 },
    { value: 'active', label: 'ออกกำลังกายหนัก (6-7 วัน/สัปดาห์)', multiplier: 1.725 }
  ];

  // ======================
  // STATE
  // ======================
  const state = {
    currentPage: 'home',
    userId: null,
    user: null, // Firebase Auth user object
    profile: null,
    todayMeals: [],
    todayTotal: 0,
    streak: 0,
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear(),
    calendarData: {},
    calValue: '',
    mealName: '',
    isLoading: true,
    selectedDay: null,
    firebaseReady: false,
    unsubscribeToday: null,
    isExerciseMode: false,
    challengeActive: false,
    todayConsumed: 0,
    todayBurned: 0
  };

  // ======================
  // UTILITY: DATES
  // ======================
  function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getTodayThaiDisplay() {
    const d = new Date();
    return `วัน${THAI_DAYS_FULL[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`;
  }

  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }

  function getMealType() {
    const hour = new Date().getHours();
    if (hour < 10) return { label: 'มื้อเช้า', icon: 'wb_sunny' };
    if (hour < 14) return { label: 'มื้อเที่ยง', icon: 'restaurant' };
    if (hour < 17) return { label: 'อาหารว่าง', icon: 'local_cafe' };
    return { label: 'มื้อเย็น', icon: 'nights_stay' };
  }

  function getCurrentTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ======================
  // CALORIE CALCULATION
  // ======================
  function calculateBMR(weight, height, age, gender) {
    if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }

  function calculateTDEE(bmr, activityLevel) {
    const level = ACTIVITY_LEVELS.find(l => l.value === activityLevel);
    return Math.round(bmr * (level ? level.multiplier : 1.2));
  }

  function calculateDailyGoal(weight, height, age, gender, activityLevel, targetWeight) {
    const bmr = calculateBMR(weight, height, age, gender);
    const tdee = calculateTDEE(bmr, activityLevel);
    if (targetWeight >= weight) return tdee;
    let goal = tdee - 500;
    const minCal = gender === 'male' ? 1500 : 1200;
    return Math.max(goal, minCal);
  }

  // ======================
  // LOCAL STORAGE DB
  // ======================
  const LocalDB = {
    _key(base) { return `muton_${state.userId}_${base}`; },
    _get(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } },
    _set(key, data) { localStorage.setItem(key, JSON.stringify(data)); },

    getProfile() { return this._get(this._key('profile')); },
    setProfile(p) { this._set(this._key('profile'), p); },

    getDay(dateStr) {
      const days = this._get(this._key('days')) || {};
      return days[dateStr] || null;
    },
    setDay(dateStr, data) {
      const days = this._get(this._key('days')) || {};
      days[dateStr] = data;
      this._set(this._key('days'), days);
    },
    getMonthDays(year, month) {
      const days = this._get(this._key('days')) || {};
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const result = {};
      for (const [k, v] of Object.entries(days)) { if (k.startsWith(prefix)) result[k] = v; }
      return result;
    },
    getAllDays() { return this._get(this._key('days')) || {}; }
  };

  // ======================
  // FIREBASE SYNC
  // ======================
  function isFirebaseConfigured() {
    try {
      const c = firebase.app().options;
      return c.projectId && !c.projectId.includes('YOUR_');
    } catch { return false; }
  }

  async function syncProfileToFirebase(profile) {
    if (!state.firebaseReady) return;
    try { await db.collection('users').doc(state.userId).set(profile, { merge: true }); }
    catch (e) { console.warn('Firebase profile sync failed:', e.message); }
  }

  async function syncDayToFirebase(dateStr, dayData) {
    if (!state.firebaseReady) return;
    try { await db.collection('users').doc(state.userId).collection('days').doc(dateStr).set(dayData); }
    catch (e) { console.warn('Firebase day sync failed:', e.message); }
  }

  async function loadProfileFromFirebase() {
    if (!state.firebaseReady) return null;
    try {
      const doc = await db.collection('users').doc(state.userId).get();
      return doc.exists ? doc.data() : null;
    } catch { return null; }
  }

  function subscribeFirebaseToday() {
    if (!state.firebaseReady) return;
    if (state.unsubscribeToday) state.unsubscribeToday();
    const today = getToday();
    try {
      state.unsubscribeToday = db.collection('users').doc(state.userId)
        .collection('days').doc(today)
        .onSnapshot((doc) => {
          if (doc.exists) {
            const data = doc.data();
            LocalDB.setDay(today, data);
            state.todayMeals = data.meals || [];
            state.todayTotal = data.totalCalories || 0;
            if (state.currentPage === 'home') updateHomeData();
          }
        }, () => { });
    } catch (e) { console.warn('Firebase subscription failed:', e.message); }
  }

  // ======================
  // DATA OPERATIONS
  // ======================
  async function loadProfile() {
    // Try local first
    let profile = LocalDB.getProfile();
    // If Firebase is ready, try to get from server too
    if (state.firebaseReady && !profile) {
      profile = await loadProfileFromFirebase();
      if (profile) LocalDB.setProfile(profile);
    }
    if (profile) { state.profile = profile; return true; }
    return false;
  }

  async function saveProfile(profileData) {
    profileData.dailyGoal = calculateDailyGoal(
      profileData.weight, profileData.height, profileData.age,
      profileData.gender, profileData.activityLevel, profileData.targetWeight
    );
    state.profile = profileData;
    LocalDB.setProfile(profileData);
    syncProfileToFirebase(profileData);
  }

  function loadTodayMeals() {
    const today = getToday();
    const dayData = LocalDB.getDay(today);
    if (dayData) {
      state.todayMeals = dayData.meals || [];
      state.todayTotal = dayData.totalCalories || 0;
      state.todayConsumed = dayData.consumed || 0;
      state.todayBurned = dayData.burned || 0;
      state.challengeActive = dayData.challengeActive || false;
    } else {
      state.todayMeals = [];
      state.todayTotal = 0;
      state.todayConsumed = 0;
      state.todayBurned = 0;
      state.challengeActive = false;
    }
  }

  function addLog(name, calories, type = 'meal') {
    const today = getToday();
    const time = getCurrentTime();
    const dayData = LocalDB.getDay(today) || { 
      date: today, 
      meals: [], 
      totalCalories: 0, 
      consumed: 0, 
      burned: 0,
      challengeActive: state.challengeActive 
    };

    const mealType = type === 'meal' ? getMealType() : { label: 'ออกกำลังกาย', icon: 'fitness_center' };
    
    dayData.meals.push({ 
      id: Date.now().toString(), 
      name, 
      calories, 
      time, 
      type: mealType.label, 
      icon: mealType.icon,
      logType: type // 'meal' or 'exercise'
    });

    const consumed = dayData.meals.filter(m => m.logType !== 'exercise').reduce((s, m) => s + m.calories, 0);
    const burned = dayData.meals.filter(m => m.logType === 'exercise').reduce((s, m) => s + m.calories, 0);
    
    dayData.consumed = consumed;
    dayData.burned = burned;
    dayData.totalCalories = consumed - burned;
    
    const baseGoal = state.profile ? state.profile.dailyGoal : 2000;
    dayData.challengeActive = state.challengeActive;
    dayData.goal = dayData.challengeActive ? baseGoal - 250 : baseGoal;
    dayData.isSuccess = dayData.totalCalories <= dayData.goal;

    LocalDB.setDay(today, dayData);
    state.todayMeals = dayData.meals;
    state.todayTotal = dayData.totalCalories;
    state.todayConsumed = dayData.consumed;
    state.todayBurned = dayData.burned;
    syncDayToFirebase(today, dayData);
    showToast('บันทึกสำเร็จ! 🎉');
  }

  // Helper for backward compatibility
  function addMeal(name, calories) { addLog(name, calories, 'meal'); }

  function deleteMeal(mealId) {
    const today = getToday();
    const dayData = LocalDB.getDay(today);
    if (!dayData) return;

    dayData.meals = dayData.meals.filter(m => m.id !== mealId);
    
    const consumed = dayData.meals.filter(m => m.logType !== 'exercise').reduce((s, m) => s + m.calories, 0);
    const burned = dayData.meals.filter(m => m.logType === 'exercise').reduce((s, m) => s + m.calories, 0);
    
    dayData.consumed = consumed;
    dayData.burned = burned;
    dayData.totalCalories = consumed - burned;
    
    const baseGoal = state.profile ? state.profile.dailyGoal : 2000;
    dayData.goal = dayData.challengeActive ? baseGoal - 250 : baseGoal;
    dayData.isSuccess = dayData.totalCalories <= dayData.goal;

    LocalDB.setDay(today, dayData);
    state.todayMeals = dayData.meals;
    state.todayTotal = dayData.totalCalories;
    state.todayConsumed = dayData.consumed;
    state.todayBurned = dayData.burned;
    syncDayToFirebase(today, dayData);
    showToast('ลบเรียบร้อย');
  }

  function calculateStreak() {
    const allDays = LocalDB.getAllDays();
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dd = allDays[ds];
      if (!dd) { if (i === 0) continue; break; }
      if (dd.isSuccess) streak++; else break;
    }
    state.streak = streak;
  }

  // ======================
  // AUTH: GOOGLE LOGIN
  // ======================
  async function signInWithGoogle() {
    try {
      // Use popup and call it synchronously to avoid iOS popup blocker
      // signInWithRedirect breaks on iOS due to ITP (cross-site tracking prevention)
      const result = await auth.signInWithPopup(googleProvider);
      return result.user;
    } catch (e) {
      console.error('Google Sign-In error:', e);
      if (e.code === 'auth/popup-blocked') {
        showToast('iOS บล็อก Popup ขอให้กดอนุญาตหรือลองใหม่ครับ');
      } else if (e.code !== 'auth/popup-closed-by-user') {
        showToast('เข้าสู่ระบบไม่สำเร็จ: ' + (e.code || 'ลองใหม่'));
      }
      return null;
    }
  }

  async function signOut() {
    try {
      if (state.unsubscribeToday) { state.unsubscribeToday(); state.unsubscribeToday = null; }
      await auth.signOut();
      state.user = null;
      state.userId = null;
      state.profile = null;
      state.todayMeals = [];
      state.todayTotal = 0;
      state.streak = 0;
      showLoginPage();
    } catch (e) {
      console.error('Sign out error:', e);
      showToast('ออกจากระบบไม่สำเร็จ');
    }
  }

  // ======================
  // TOAST
  // ======================
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full font-body text-sm font-medium shadow-lg';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
  }

  // ======================
  // ROUTER
  // ======================
  function navigate(page) {
    state.currentPage = page;
    updateBottomNav();
    renderPage();
    if (page !== 'add-meal') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateBottomNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    nav.style.display = (state.currentPage === 'add-meal' || state.currentPage === 'login') ? 'none' : '';
    nav.querySelectorAll('.nav-item').forEach(btn => {
      if (btn.dataset.page === state.currentPage) {
        btn.classList.add('active'); btn.classList.remove('text-on-surface-variant');
      } else {
        btn.classList.remove('active'); btn.classList.add('text-on-surface-variant');
      }
    });
  }

  function renderPage() {
    const content = document.getElementById('app-content');
    const topBar = document.getElementById('top-bar');
    switch (state.currentPage) {
      case 'login': renderLogin(content); topBar.style.display = 'none'; break;
      case 'home': renderHome(content); topBar.style.display = ''; break;
      case 'add-meal': renderAddMeal(content); topBar.style.display = 'none'; break;
      case 'calendar': renderCalendar(content); topBar.style.display = ''; break;
      case 'settings': renderSettings(content); topBar.style.display = ''; break;
    }
  }

  function showLoginPage() {
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    state.currentPage = 'login';
    renderLogin(document.getElementById('app-content'));
  }

  // ======================
  // PAGE: LOGIN
  // ======================
  function renderLogin(container) {
    container.innerHTML = `
      <div class="page-enter flex flex-col items-center justify-center gap-8 px-6 text-center pt-3">
        <!-- Logo Section -->
        <div class="flex flex-col items-center gap-3">
          <div class="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span class="material-symbols-outlined text-on-primary text-5xl" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
          </div>
          <h1 class="font-headline text-4xl font-black text-primary tracking-tight mt-2">MuTon</h1>
          <p class="font-body text-on-surface-variant text-base max-w-[260px] leading-relaxed">นับแคลอรี่ ควบคุมน้ำหนัก<br>ติดตามความสำเร็จทุกวัน</p>
        </div>

        <!-- Features -->
        <div class="flex flex-col gap-3 w-full max-w-[300px]">
          <div class="flex items-center gap-3 bg-surface-container-lowest rounded-2xl px-4 py-3 border border-outline-variant/10">
            <span class="material-symbols-outlined text-primary text-xl" style="font-variation-settings: 'FILL' 1;">monitoring</span>
            <span class="font-body text-on-surface text-sm">คำนวณเป้าแคลประจำวัน</span>
          </div>
          <div class="flex items-center gap-3 bg-surface-container-lowest rounded-2xl px-4 py-3 border border-outline-variant/10">
            <span class="material-symbols-outlined text-primary text-xl" style="font-variation-settings: 'FILL' 1;">restaurant</span>
            <span class="font-body text-on-surface text-sm">บันทึกมื้ออาหารง่ายๆ</span>
          </div>
          <div class="flex items-center gap-3 bg-surface-container-lowest rounded-2xl px-4 py-3 border border-outline-variant/10">
            <span class="material-symbols-outlined text-primary text-xl" style="font-variation-settings: 'FILL' 1;">calendar_month</span>
            <span class="font-body text-on-surface text-sm">ปฏิทินแสดงวันที่สำเร็จ</span>
          </div>
        </div>

        <!-- Google Sign In Button -->
        <button id="btn-google-signin" class="w-full max-w-[300px] bg-surface-container-lowest text-on-surface font-body font-semibold text-base py-4 px-6 rounded-full border border-outline-variant/20 hover:bg-surface-container-low active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(44,47,49,0.08)] flex items-center justify-center gap-3 mt-2">
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          เข้าสู่ระบบด้วย Google
        </button>

        <p class="font-body text-on-surface-variant text-xs opacity-60 mt-2 max-w-[260px]">
          ข้อมูลจะถูกเก็บในบัญชี Google ของคุณ<br>เพื่อซิงค์ข้อมูลข้ามอุปกรณ์
        </p>
      </div>
    `;

    document.getElementById('btn-google-signin').addEventListener('click', async () => {
      // ⚠️ IMPORTANT: Must call Firebase Auth immediately in the click event
      // before any DOM manipulation, otherwise iOS Safari will block the popup!
      const signInPromise = signInWithGoogle();

      const btn = document.getElementById('btn-google-signin');
      btn.disabled = true;
      btn.innerHTML = `
        <div class="w-5 h-5 border-2 border-on-surface-variant/30 border-t-primary rounded-full animate-spin"></div>
        กำลังเข้าสู่ระบบ...
      `;

      await signInPromise;

      // If sign in fails, restore button
      if (!state.user) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          เข้าสู่ระบบด้วย Google
        `;
      }
    });
  }

  // ======================
  // PAGE: HOME
  // ======================
  function renderHome(container) {
    loadTodayMeals();
    calculateStreak();

    const baseGoal = state.profile ? state.profile.dailyGoal : 2000;
    const goal = state.challengeActive ? baseGoal - 250 : baseGoal;
    const netCalories = state.todayTotal;
    const consumed = state.todayConsumed;
    const burned = state.todayBurned;
    
    const remaining = Math.max(0, goal - netCalories);
    const percentage = Math.min(1, Math.max(0, netCalories) / goal);
    const circumference = 2 * Math.PI * 100;
    const dashoffset = circumference * (1 - percentage);
    const isOver = netCalories > goal;
    const progressColor = isOver ? '#e57373' : '#006947';
    const progressTrackColor = isOver ? '#ffcdd2' : '#69f6b8';

    // User info for header
    const userName = state.user?.displayName?.split(' ')[0] || '';
    const userPhoto = state.user?.photoURL || '';

    container.innerHTML = `
      <div class="page-enter flex flex-col gap-6 pt-2 pb-safe-fab">
        <!-- Greeting & Streak -->
        <section class="flex justify-between items-end">
          <div>
            <h1 class="font-headline text-3xl text-primary font-bold tracking-tight">วันนี้</h1>
            <p class="font-body text-on-surface-variant text-sm mt-0.5">${getTodayThaiDisplay()}</p>
          </div>
          ${state.streak > 0 ? `
          <div class="bg-surface-container-lowest px-3 py-1.5 rounded-full border border-outline-variant/15 flex items-center gap-1.5 streak-pulse">
            <span class="material-symbols-outlined text-tertiary text-sm" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>
            <span class="font-label font-semibold text-tertiary text-sm">${state.streak} วันติดต่อกัน</span>
          </div>` : ''}
        </section>

        <!-- Challenge Mode Card -->
        <section class="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 flex items-center justify-between shadow-sm ${state.challengeActive ? 'challenge-active' : ''}">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full ${state.challengeActive ? 'bg-tertiary/20 text-tertiary' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center">
              <span class="material-symbols-outlined text-xl" style="font-variation-settings: 'FILL' ${state.challengeActive ? '1' : '0'};">bolt</span>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h3 class="font-headline text-sm font-bold ${state.challengeActive ? 'text-tertiary' : 'text-on-surface'}">Challenge Mode</h3>
                ${state.challengeActive ? '<span class="challenge-badge">Active</span>' : ''}
              </div>
              <p class="font-body text-[11px] text-on-surface-variant">ลดเป้าแคลอรี่ลง 250 เพื่อเบิร์นไขมันไวขึ้น</p>
            </div>
          </div>
          <button id="toggle-challenge" class="w-12 h-6 rounded-full relative transition-colors ${state.challengeActive ? 'bg-tertiary' : 'bg-surface-container-highest'}">
            <div class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${state.challengeActive ? 'translate-x-6' : ''}"></div>
          </button>
        </section>

        <!-- Progress Hero Card -->
        <section class="bg-surface-container-lowest rounded-3xl p-6 relative overflow-hidden shadow-[0_20px_40px_rgba(44,47,49,0.06)] border border-outline-variant/10">
          <div class="absolute -top-16 -left-16 w-56 h-56 bg-primary-container/25 rounded-full blur-3xl pointer-events-none"></div>
          <div class="flex flex-col items-center gap-6 relative z-10">
            <div class="relative w-44 h-44 flex items-center justify-center">
              <svg class="w-full h-full circle-progress absolute top-0 left-0" viewBox="0 0 220 220">
                <circle cx="110" cy="110" r="100" fill="none" stroke="${progressTrackColor}" stroke-width="14" opacity="0.35"></circle>
                <circle cx="110" cy="110" r="100" fill="none" stroke="${progressColor}" stroke-width="14"
                  stroke-dasharray="${circumference}" stroke-dashoffset="${dashoffset}" class="circle-progress-fill"></circle>
              </svg>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="font-headline text-4xl font-bold tracking-tighter ${isOver ? 'text-error' : 'text-on-surface'}">${formatNumber(isOver ? netCalories - goal : remaining)}</span>
                <span class="font-label text-xs text-on-surface-variant font-medium mt-0.5">${isOver ? 'เกินเป้า!' : 'แคลที่เหลือ'}</span>
              </div>
            </div>
            <div class="grid grid-cols-3 w-full px-2 gap-4">
              <div class="flex flex-col">
                <span class="font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">กินไปแล้ว</span>
                <span class="font-headline text-lg font-semibold text-primary">${formatNumber(consumed)} <span class="text-[10px] font-normal text-on-surface-variant">แคล</span></span>
              </div>
              <div class="flex flex-col items-center border-x border-outline-variant/20">
                <span class="font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">เบิร์นออก</span>
                <span class="font-headline text-lg font-semibold text-tertiary">${formatNumber(burned)} <span class="text-[10px] font-normal text-on-surface-variant">แคล</span></span>
              </div>
              <div class="text-right flex flex-col">
                <span class="font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">เป้าหมาย</span>
                <span class="font-headline text-lg font-medium text-on-surface">${formatNumber(goal)} <span class="text-[10px] font-normal text-on-surface-variant">แคล</span></span>
              </div>
            </div>
            ${isOver ? `
            <div class="w-full bg-error-container/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span class="material-symbols-outlined text-error text-lg">warning</span>
              <span class="font-body text-sm text-error font-medium">เกินเป้าไป ${formatNumber(netCalories - goal)} แคล</span>
            </div>` : ''}
          </div>
        </section>

        <!-- Meals Log -->
        <section class="flex flex-col gap-3">
          <h2 class="font-headline text-xl font-bold text-on-surface flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-xl">receipt_long</span>
            บันทึกประจำวัน
          </h2>
          <div id="meals-list" class="flex flex-col gap-3 pb-4">${renderMealsList()}</div>
        </section>
      </div>
      <div class="fixed right-5 z-40" style="bottom: calc(5.5rem + env(safe-area-inset-bottom, 16px));">
        <button id="fab-add" class="fab bg-primary text-on-primary w-14 h-14 rounded-2xl flex items-center justify-center shadow-[0_8px_24px_rgba(0,105,71,0.3)]">
          <span class="material-symbols-outlined text-2xl">add</span>
        </button>
      </div>
    `;

    document.getElementById('fab-add').addEventListener('click', () => navigate('add-meal'));
    document.getElementById('toggle-challenge').addEventListener('click', () => {
      state.challengeActive = !state.challengeActive;
      const today = getToday();
      const dayData = LocalDB.getDay(today) || { date: today, meals: [], totalCalories: 0, challengeActive: state.challengeActive };
      dayData.challengeActive = state.challengeActive;
      const baseGoal = state.profile ? state.profile.dailyGoal : 2000;
      dayData.goal = state.challengeActive ? baseGoal - 250 : baseGoal;
      dayData.isSuccess = dayData.totalCalories <= dayData.goal;
      LocalDB.setDay(today, dayData);
      syncDayToFirebase(today, dayData);
      renderHome(container);
      showToast(state.challengeActive ? 'เปิดโหมดท้าทายแล้ว! 🔥' : 'ปิดโหมดท้าทาย');
    });
    bindMealDeleteButtons();

    // Update top bar avatar
    updateTopBar();
  }

  function renderMealsList() {
    if (state.todayMeals.length === 0) {
      return `
        <div class="bg-surface-container-lowest rounded-2xl p-8 text-center border border-outline-variant/10">
          <span class="material-symbols-outlined text-on-surface-variant text-4xl mb-2 block opacity-40">restaurant</span>
          <p class="font-body text-on-surface-variant text-sm">ยังไม่ได้บันทึกมื้อไหนเลย</p>
          <p class="font-body text-on-surface-variant text-xs mt-1 opacity-60">กดปุ่ม + เพื่อเพิ่มมื้ออาหาร</p>
        </div>`;
    }
    return state.todayMeals.map(meal => `
      <article class="meal-card ${meal.logType === 'exercise' ? 'exercise' : ''} bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 flex items-center gap-3" data-meal-id="${meal.id}">
        <div class="w-10 h-10 rounded-xl ${meal.logType === 'exercise' ? 'bg-tertiary/10' : 'bg-surface-container'} flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined ${meal.logType === 'exercise' ? 'text-tertiary' : 'text-primary'} text-lg">${meal.icon || 'restaurant'}</span>
        </div>
        <div class="flex-grow min-w-0">
          <span class="font-label text-[10px] font-semibold uppercase tracking-wider ${meal.logType === 'exercise' ? 'text-tertiary' : 'text-primary'}">${meal.type} • ${meal.time}</span>
          <h3 class="font-body font-medium text-on-surface text-sm truncate mt-0.5">${meal.name}</h3>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="font-headline font-semibold ${meal.logType === 'exercise' ? 'text-tertiary' : 'text-on-surface'} bg-surface-container px-3 py-1 rounded-full text-xs">${meal.logType === 'exercise' ? '-' : ''}${formatNumber(meal.calories)} แคล</span>
          <button class="btn-delete-meal p-1.5 rounded-full hover:bg-error-container/20 transition-colors text-on-surface-variant hover:text-error" data-meal-id="${meal.id}">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </article>
    `).join('');
  }

  function bindMealDeleteButtons() {
    document.querySelectorAll('.btn-delete-meal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.meal-card');
        if (card) card.classList.add('meal-delete-anim');
        setTimeout(() => { deleteMeal(btn.dataset.mealId); renderHome(document.getElementById('app-content')); }, 300);
      });
    });
  }

  function updateHomeData() {
    if (state.currentPage === 'home') renderHome(document.getElementById('app-content'));
  }

  function updateTopBar() {
    const topBar = document.getElementById('top-bar');
    if (!topBar || !state.user) return;

    const photo = state.user.photoURL;
    const logoDiv = topBar.querySelector('.flex.items-center.gap-3');
    if (logoDiv && photo) {
      logoDiv.innerHTML = `
        <img src="${photo}" alt="avatar" class="w-9 h-9 rounded-xl object-cover border-2 border-primary-container" referrerpolicy="no-referrer">
        <span class="font-headline font-black text-primary text-xl tracking-tight">MuTon</span>
      `;
    }
  }

  // ======================
  // PAGE: ADD MEAL
  // ======================
  function renderAddMeal(container) {
    state.calValue = '';
    state.mealName = '';

    container.innerHTML = `
      <div class="page-slide-up flex flex-col min-h-[min(100dvh,800px)] -mx-4 -mt-28 -mb-24 px-4 ${state.isExerciseMode ? 'bg-on-tertiary' : 'bg-surface'}" style="padding-top: env(safe-area-inset-top, 12px); padding-bottom: calc(env(safe-area-inset-bottom, 24px) + 24px);">
        <div class="flex justify-between items-center py-3 mb-2">
          <button id="btn-close-add" class="p-2 -ml-2 rounded-full hover:bg-surface-container transition-colors ${state.isExerciseMode ? 'text-tertiary' : 'text-primary'}">
            <span class="material-symbols-outlined text-2xl">close</span>
          </button>
          <span class="font-headline font-black ${state.isExerciseMode ? 'text-tertiary' : 'text-primary'} text-xl">MuTon</span>
          <div class="w-10"></div>
        </div>
        
        <!-- Toggle Tabs -->
        <div class="flex bg-surface-container-low p-1 rounded-2xl mb-6 mx-4">
          <button id="tab-meal" class="flex-1 py-2.5 rounded-xl font-headline text-sm font-bold transition-all ${!state.isExerciseMode ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}">
            อาหาร
          </button>
          <button id="tab-exercise" class="flex-1 py-2.5 rounded-xl font-headline text-sm font-bold transition-all ${state.isExerciseMode ? 'bg-white text-tertiary shadow-sm' : 'text-on-surface-variant'}">
            ออกกำลังกาย
          </button>
        </div>

        <div class="text-center mb-6">
          <h1 class="font-headline text-2xl font-bold text-on-surface tracking-tight">${state.isExerciseMode ? 'บันทึกการเบิร์น' : 'เพิ่มมื้ออาหาร'}</h1>
          <p class="text-on-surface-variant text-sm font-body mt-1">${state.isExerciseMode ? 'วันนี้ออกกำลังกายอะไรไปบ้าง?' : 'วันนี้กินอะไร?'}</p>
        </div>
        <div class="flex flex-col gap-1.5 mb-6">
          <label class="font-label text-sm font-semibold text-on-surface ml-1" for="meal-name-input">${state.isExerciseMode ? 'กิจกรรม' : 'ชื่อเมนู'}</label>
          <input id="meal-name-input" type="text" class="w-full bg-surface-container text-on-surface placeholder:text-on-surface-variant/50 rounded-2xl border-none focus:ring-0 focus:bg-surface-container-high transition-colors py-3.5 px-5 font-body text-base settings-input" placeholder="${state.isExerciseMode ? 'เช่น วิ่ง, ปั่นจักรยาน, เดิน' : 'เช่น ข้าวผัด, ส้มตำ, กาแฟ'}" autocomplete="off">
        </div>
        <div class="flex flex-col items-center gap-1 mb-4">
          <span class="font-label text-sm text-on-surface-variant font-medium mb-1">${state.isExerciseMode ? 'แคลอรี่ที่เผาผลาญ' : 'แคลอรี่'}</span>
          <div class="flex items-end justify-center gap-2">
            <span id="cal-display" class="font-headline text-6xl leading-none font-bold ${state.isExerciseMode ? 'text-tertiary' : 'text-primary'} tracking-tighter cal-number">0</span>
            <span class="font-body text-lg leading-none text-on-surface-variant font-medium mb-1.5">แคล</span>
          </div>
          <div class="w-24 h-1 bg-surface-container-high rounded-full mt-3"></div>
        </div>
        <div class="flex-grow"></div>
        <div class="grid grid-cols-3 gap-2.5 mb-4 px-1">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="numpad-btn h-14 rounded-2xl bg-surface-container-low text-on-surface font-headline text-xl font-medium" data-num="${n}">${n}</button>`).join('')}
          <div></div>
          <button class="numpad-btn h-14 rounded-2xl bg-surface-container-low text-on-surface font-headline text-xl font-medium" data-num="0">0</button>
          <button class="numpad-btn h-14 rounded-2xl bg-surface-container-low text-on-surface-variant flex items-center justify-center" data-action="backspace">
            <span class="material-symbols-outlined text-xl">backspace</span>
          </button>
        </div>
        <button id="btn-add-diary" class="w-full ${state.isExerciseMode ? 'bg-tertiary text-on-tertiary-fixed' : 'bg-primary text-on-primary'} font-headline font-semibold text-base py-4 rounded-full hover:opacity-90 active:scale-[0.98] transition-all shadow-lg flex justify-center items-center gap-2 mb-6">
          <span class="material-symbols-outlined text-lg">check_circle</span> บันทึก
        </button>
      </div>
    `;

    document.getElementById('btn-close-add').addEventListener('click', () => navigate('home'));
    document.getElementById('meal-name-input').addEventListener('input', (e) => { state.mealName = e.target.value; });

    container.querySelectorAll('.numpad-btn[data-num]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.calValue.length >= 5) return;
        state.calValue += btn.dataset.num;
        document.getElementById('cal-display').textContent = formatNumber(parseInt(state.calValue) || 0);
      });
    });

    container.querySelector('[data-action="backspace"]').addEventListener('click', () => {
      state.calValue = state.calValue.slice(0, -1);
      document.getElementById('cal-display').textContent = formatNumber(parseInt(state.calValue) || 0);
    });

    document.getElementById('tab-meal').addEventListener('click', () => { state.isExerciseMode = false; renderAddMeal(container); });
    document.getElementById('tab-exercise').addEventListener('click', () => { state.isExerciseMode = true; renderAddMeal(container); });

    document.getElementById('btn-add-diary').addEventListener('click', () => {
      const name = state.mealName.trim();
      const cal = parseInt(state.calValue) || 0;
      if (!name) { showToast(state.isExerciseMode ? 'กรุณาใส่ชื่อกิจกรรม' : 'กรุณาใส่ชื่อเมนู'); document.getElementById('meal-name-input').focus(); return; }
      if (cal <= 0) { showToast('กรุณาใส่จำนวนแคลอรี่'); return; }
      addLog(name, cal, state.isExerciseMode ? 'exercise' : 'meal');
      state.isExerciseMode = false; // Reset for next time
      navigate('home');
    });
  }

  // ======================
  // PAGE: CALENDAR
  // ======================
  function renderCalendar(container) {
    state.calendarData = LocalDB.getMonthDays(state.calendarYear, state.calendarMonth);

    container.innerHTML = `
      <div class="page-enter flex flex-col gap-5 pt-2">
        <section class="flex justify-between items-center">
          <button id="btn-prev-month" class="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
            <span class="material-symbols-outlined text-xl">chevron_left</span>
          </button>
          <h1 class="font-headline text-xl font-bold text-on-surface">${THAI_MONTHS[state.calendarMonth]} ${state.calendarYear + 543}</h1>
          <button id="btn-next-month" class="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
            <span class="material-symbols-outlined text-xl">chevron_right</span>
          </button>
        </section>
        <div class="flex justify-center gap-4 text-xs font-label text-on-surface-variant">
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-primary"></span> สำเร็จ</div>
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-error"></span> เกินเป้า</div>
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-surface-container-high"></span> ไม่มีข้อมูล</div>
        </div>
        <section class="bg-surface-container-lowest rounded-3xl p-4 border border-outline-variant/10 shadow-[0_8px_24px_rgba(44,47,49,0.04)]">
          <div class="grid grid-cols-7 gap-1 mb-2">
            ${THAI_DAYS_SHORT.map(d => `<div class="text-center font-label text-xs font-semibold text-on-surface-variant py-1">${d}</div>`).join('')}
          </div>
          <div id="cal-grid" class="grid grid-cols-7 gap-1"></div>
        </section>
        <div id="day-detail"></div>
        <div id="month-summary"></div>
        <div id="goal-prediction"></div>
      </div>
    `;

    document.getElementById('btn-prev-month').addEventListener('click', () => {
      state.calendarMonth--;
      if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear--; }
      state.selectedDay = null;
      renderCalendar(container);
    });
    document.getElementById('btn-next-month').addEventListener('click', () => {
      state.calendarMonth++;
      if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; }
      state.selectedDay = null;
      renderCalendar(container);
    });

    renderCalendarGrid();
    renderMonthSummary();
    renderGoalPrediction();
  }

  function renderGoalPrediction() {
    const container = document.getElementById('goal-prediction');
    if (!container) return;
    
    const p = state.profile;
    if (!p || !p.weight || !p.targetWeight || p.weight <= p.targetWeight) {
      container.innerHTML = '';
      return;
    }
    
    // Calculate average deficit from actual data (last 7 days)
    const allDays = LocalDB.getAllDays();
    const today = new Date();
    let totalDeficit = 0;
    let daysWithData = 0;
    
    const bmr = calculateBMR(p.weight, p.height, p.age, p.gender);
    const tdee = calculateTDEE(bmr, p.activityLevel);

    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dd = allDays[ds];
      if (dd && dd.totalCalories !== undefined) {
        // Deficit = TDEE - NetCalories
        totalDeficit += (tdee - dd.totalCalories);
        daysWithData++;
      }
    }

    // Fallback to theoretical goal if no data
    const actualDailyDeficit = daysWithData > 0 ? (totalDeficit / daysWithData) : (tdee - p.dailyGoal);
    
    if (actualDailyDeficit <= 0) {
      container.innerHTML = `
        <section class="bg-error-container/20 rounded-3xl p-5 border border-error/20 mt-1 flex items-start gap-4">
          <div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0 text-error">
            <span class="material-symbols-outlined text-2xl">warning</span>
          </div>
          <div>
            <h3 class="font-headline text-sm font-bold text-error">คำเตือน</h3>
            <p class="font-body text-xs text-on-surface mt-0.5 leading-relaxed">
              ค่าเฉลี่ยการกินของคุณปัจจุบัน ${formatNumber(Math.round(tdee - actualDailyDeficit))} แคล ยังไม่ทำให้เกิดการลดน้ำหนัก (TDEE: ${formatNumber(tdee)})
            </p>
            <p class="font-body text-[11px] text-error mt-1 opacity-80">ลองออกกำลังกายเพิ่มหรือลดแคลอรี่ดูนะครับ!</p>
          </div>
        </section>
      `;
      return;
    }
    
    const totalDeficitNeeded = (p.weight - p.targetWeight) * 7700;
    const daysNeeded = Math.ceil(totalDeficitNeeded / actualDailyDeficit);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysNeeded);
    
    const targetDateStr = `${targetDate.getDate()} ${THAI_MONTHS[targetDate.getMonth()]} ${targetDate.getFullYear() + 543}`;
    
    container.innerHTML = `
      <section class="bg-primary-container/20 rounded-3xl p-5 border border-primary/20 mt-1 flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
          <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">emoji_events</span>
        </div>
        <div>
          <h3 class="font-headline text-sm font-bold text-primary">คาดว่าจะสำเร็จในวันที่</h3>
          <p class="font-headline text-xl font-bold text-on-surface mt-0.5">${targetDateStr}</p>
          <p class="font-body text-[11px] text-on-surface-variant mt-1.5 leading-relaxed opacity-80">
            *คำนวณจากพฤติกรรมจริง 7 วันล่าสุดของคุณ (Deficit เฉลี่ย: ${formatNumber(Math.round(actualDailyDeficit))} แคล/วัน)
          </p>
        </div>
      </section>
    `;
  }

  function renderCalendarGrid() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    const { calendarYear: year, calendarMonth: month } = state;
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const todayStr = getToday();
    let html = '';

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell rounded-xl"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dd = state.calendarData[ds];
      let cls = 'cal-cell rounded-xl flex items-center justify-center text-sm font-medium cursor-pointer';
      if (dd) cls += dd.isSuccess ? ' cal-success' : ' cal-fail';
      else cls += ' bg-surface-container/50 text-on-surface-variant';
      if (ds === todayStr) cls += ' cal-today';
      if (ds === state.selectedDay) cls += ' cal-selected';
      html += `<div class="${cls}" data-date="${ds}">${day}</div>`;
    }

    grid.innerHTML = html;
    grid.querySelectorAll('[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        state.selectedDay = cell.dataset.date;
        grid.querySelectorAll('.cal-selected').forEach(el => el.classList.remove('cal-selected'));
        cell.classList.add('cal-selected');
        renderDayDetail(cell.dataset.date);
      });
    });
  }

  function renderDayDetail(dateStr) {
    const detail = document.getElementById('day-detail');
    if (!detail) return;
    const dayData = state.calendarData[dateStr] || LocalDB.getDay(dateStr);

    if (!dayData || !dayData.meals || dayData.meals.length === 0) {
      const d = new Date(dateStr);
      detail.innerHTML = `<div class="day-detail-modal bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 text-center">
        <p class="font-body text-on-surface-variant text-sm">${d.getDate()} ${THAI_MONTHS[d.getMonth()]} — ไม่มีข้อมูล</p></div>`;
      return;
    }

    const d = new Date(dateStr);
    detail.innerHTML = `
      <div class="day-detail-modal bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-headline text-base font-bold text-on-surface">${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}</h3>
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${dayData.isSuccess ? 'bg-primary-container text-on-primary-container' : 'bg-error-container/30 text-error'}">
            ${dayData.isSuccess ? '✓ สำเร็จ' : '✗ เกินเป้า'}
          </span>
        </div>
        <div class="flex gap-4 mb-4 text-sm">
          <span class="font-label text-on-surface-variant">กินไป <strong class="${dayData.isSuccess ? 'text-primary' : 'text-error'}">${formatNumber(dayData.totalCalories)}</strong> แคล</span>
          <span class="font-label text-on-surface-variant">เป้า <strong>${formatNumber(dayData.goal)}</strong> แคล</span>
        </div>
        <div class="flex flex-col gap-2">
          ${dayData.meals.map(m => `
            <div class="flex justify-between items-center py-1.5 border-b border-outline-variant/5 last:border-0">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-sm text-primary">${m.icon || 'restaurant'}</span>
                <span class="font-body text-sm text-on-surface">${m.name}</span>
              </div>
              <span class="font-body text-sm text-on-surface-variant">${formatNumber(m.calories)} แคล</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderMonthSummary() {
    const summary = document.getElementById('month-summary');
    if (!summary) return;
    const entries = Object.values(state.calendarData);
    if (entries.length === 0) { summary.innerHTML = ''; return; }

    const success = entries.filter(d => d.isSuccess).length;
    const fail = entries.filter(d => !d.isSuccess).length;
    const avg = Math.round(entries.reduce((s, d) => s + (d.totalCalories || 0), 0) / entries.length);

    summary.innerHTML = `
      <section class="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10">
        <h3 class="font-headline text-base font-bold text-on-surface mb-3">
          <span class="material-symbols-outlined text-primary text-base align-text-bottom mr-1">analytics</span> สรุปประจำเดือน
        </h3>
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-surface-container rounded-xl p-3 text-center">
            <span class="font-headline text-xl font-bold text-primary">${success}</span>
            <p class="font-label text-[10px] text-on-surface-variant mt-0.5">วันสำเร็จ</p>
          </div>
          <div class="bg-surface-container rounded-xl p-3 text-center">
            <span class="font-headline text-xl font-bold text-error">${fail}</span>
            <p class="font-label text-[10px] text-on-surface-variant mt-0.5">วันเกินเป้า</p>
          </div>
          <div class="bg-surface-container rounded-xl p-3 text-center">
            <span class="font-headline text-xl font-bold text-on-surface">${formatNumber(avg)}</span>
            <p class="font-label text-[10px] text-on-surface-variant mt-0.5">เฉลี่ย/วัน</p>
          </div>
        </div>
      </section>`;
  }

  // ======================
  // PAGE: SETTINGS
  // ======================
  function renderSettings(container) {
    const p = state.profile || {};
    const isOnboarding = !state.profile;
    const user = state.user;

    container.innerHTML = `
      <div class="page-enter flex flex-col gap-6 pt-2 pb-8">
        <!-- User Info Card -->
        ${user ? `
        <section class="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 flex items-center gap-4">
          <img src="${user.photoURL || ''}" alt="avatar" class="w-14 h-14 rounded-2xl object-cover border-2 border-primary-container" referrerpolicy="no-referrer">
          <div class="flex-grow min-w-0">
            <h2 class="font-headline text-base font-bold text-on-surface truncate">${user.displayName || 'ผู้ใช้'}</h2>
            <p class="font-body text-xs text-on-surface-variant truncate">${user.email || ''}</p>
          </div>
          <button id="btn-logout" class="p-2 rounded-full hover:bg-error-container/20 transition-colors text-on-surface-variant hover:text-error" title="ออกจากระบบ">
            <span class="material-symbols-outlined text-xl">logout</span>
          </button>
        </section>` : ''}

        <!-- Header -->
        <section class="text-center">
          <div class="w-16 h-16 rounded-2xl bg-primary-container mx-auto flex items-center justify-center mb-3">
            <span class="material-symbols-outlined text-primary text-3xl">${isOnboarding ? 'waving_hand' : 'person'}</span>
          </div>
          <h1 class="font-headline text-2xl font-bold text-on-surface">
            ${isOnboarding ? 'ยินดีต้อนรับ!' : 'ข้อมูลของฉัน'}
          </h1>
          <p class="font-body text-on-surface-variant text-sm mt-1">
            ${isOnboarding ? 'กรอกข้อมูลเพื่อคำนวณเป้าแคลอรี่ของคุณ' : 'แก้ไขข้อมูลเพื่ออัปเดตเป้าหมาย'}
          </p>
        </section>

        <div class="flex flex-col gap-5">
          <!-- Gender -->
          <div class="flex flex-col gap-2">
            <label class="font-label text-sm font-semibold text-on-surface ml-1">เพศ</label>
            <div class="grid grid-cols-2 gap-3">
              <button class="gender-btn rounded-2xl py-3.5 font-body font-medium text-sm border border-outline-variant/15 bg-surface-container-lowest ${p.gender === 'male' ? 'selected' : 'text-on-surface-variant'}" data-gender="male">
                <span class="material-symbols-outlined text-lg align-text-bottom mr-1">male</span> ชาย
              </button>
              <button class="gender-btn rounded-2xl py-3.5 font-body font-medium text-sm border border-outline-variant/15 bg-surface-container-lowest ${p.gender === 'female' ? 'selected' : 'text-on-surface-variant'}" data-gender="female">
                <span class="material-symbols-outlined text-lg align-text-bottom mr-1">female</span> หญิง
              </button>
            </div>
          </div>

          <!-- Age -->
          <div class="flex flex-col gap-1.5">
            <label class="font-label text-sm font-semibold text-on-surface ml-1" for="input-age">อายุ (ปี)</label>
            <input id="input-age" type="number" inputmode="numeric" min="10" max="100"
              class="w-full bg-surface-container text-on-surface rounded-2xl border-none py-3.5 px-5 font-body text-base settings-input"
              placeholder="เช่น 25" value="${p.age || ''}">
          </div>

          <!-- Weight -->
          <div class="flex flex-col gap-1.5">
            <label class="font-label text-sm font-semibold text-on-surface ml-1" for="input-weight">น้ำหนักปัจจุบัน (กก.)</label>
            <input id="input-weight" type="number" inputmode="decimal" step="0.1" min="30" max="300"
              class="w-full bg-surface-container text-on-surface rounded-2xl border-none py-3.5 px-5 font-body text-base settings-input"
              placeholder="เช่น 75" value="${p.weight || ''}">
          </div>

          <!-- Height -->
          <div class="flex flex-col gap-1.5">
            <label class="font-label text-sm font-semibold text-on-surface ml-1" for="input-height">ส่วนสูง (ซม.)</label>
            <input id="input-height" type="number" inputmode="numeric" min="100" max="250"
              class="w-full bg-surface-container text-on-surface rounded-2xl border-none py-3.5 px-5 font-body text-base settings-input"
              placeholder="เช่น 170" value="${p.height || ''}">
          </div>

          <!-- Target Weight -->
          <div class="flex flex-col gap-1.5">
            <label class="font-label text-sm font-semibold text-on-surface ml-1" for="input-target">น้ำหนักเป้าหมาย (กก.)</label>
            <input id="input-target" type="number" inputmode="decimal" step="0.1" min="30" max="300"
              class="w-full bg-surface-container text-on-surface rounded-2xl border-none py-3.5 px-5 font-body text-base settings-input"
              placeholder="เช่น 65" value="${p.targetWeight || ''}">
            <p class="font-label text-xs text-on-surface-variant ml-1 opacity-70">ใส่น้ำหนักที่น้อยกว่าปัจจุบันเพื่อลดน้ำหนัก</p>
          </div>

          <!-- Activity Level -->
          <div class="flex flex-col gap-1.5">
            <label class="font-label text-sm font-semibold text-on-surface ml-1" for="input-activity">ระดับกิจกรรม</label>
            <select id="input-activity" class="w-full bg-surface-container text-on-surface rounded-2xl border-none py-3.5 px-5 font-body text-base settings-input appearance-none">
              ${ACTIVITY_LEVELS.map(a => `<option value="${a.value}" ${p.activityLevel === a.value ? 'selected' : ''}>${a.label}</option>`).join('')}
            </select>
          </div>

          <!-- Goal Preview -->
          <div class="bg-primary-container/20 rounded-2xl p-5 text-center border border-primary/10">
            <span class="font-label text-sm text-on-surface-variant">เป้าแคลอรี่ต่อวัน</span>
            <div class="font-headline text-4xl font-bold text-primary mt-1" id="goal-preview-number">${p.dailyGoal ? formatNumber(p.dailyGoal) : '—'}</div>
            <span class="font-body text-sm text-on-surface-variant">แคลอรี่</span>
          </div>

          <!-- Save -->
          <button id="btn-save-profile" class="w-full bg-primary text-on-primary font-headline font-semibold text-base py-4 rounded-full hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_12px_32px_rgba(0,105,71,0.2)] flex justify-center items-center gap-2 mt-2">
            <span class="material-symbols-outlined text-lg">save</span>
            ${isOnboarding ? 'เริ่มต้นใช้งาน' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </div>
    `;

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      if (confirm('ต้องการออกจากระบบหรือไม่?')) signOut();
    });

    // Gender toggle
    container.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.gender-btn').forEach(b => { b.classList.remove('selected'); b.classList.add('text-on-surface-variant'); });
        btn.classList.add('selected'); btn.classList.remove('text-on-surface-variant');
        recalcGoalPreview();
      });
    });

    // Live preview
    ['input-age', 'input-weight', 'input-height', 'input-target', 'input-activity'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', recalcGoalPreview);
    });

    // Save
    document.getElementById('btn-save-profile').addEventListener('click', async () => {
      const gender = container.querySelector('.gender-btn.selected')?.dataset.gender;
      const age = parseInt(document.getElementById('input-age').value);
      const weight = parseFloat(document.getElementById('input-weight').value);
      const height = parseFloat(document.getElementById('input-height').value);
      const targetWeight = parseFloat(document.getElementById('input-target').value);
      const activityLevel = document.getElementById('input-activity').value;

      if (!gender) { showToast('กรุณาเลือกเพศ'); return; }
      if (!age || age < 10 || age > 100) { showToast('กรุณาใส่อายุที่ถูกต้อง (10-100)'); return; }
      if (!weight || weight < 30 || weight > 300) { showToast('กรุณาใส่น้ำหนักที่ถูกต้อง'); return; }
      if (!height || height < 100 || height > 250) { showToast('กรุณาใส่ส่วนสูงที่ถูกต้อง'); return; }
      if (!targetWeight || targetWeight < 30 || targetWeight > 300) { showToast('กรุณาใส่น้ำหนักเป้าหมาย'); return; }

      await saveProfile({ gender, age, weight, height, targetWeight, activityLevel });
      showToast('บันทึกข้อมูลเรียบร้อย! 🎉');

      const today = getToday();
      const todayData = LocalDB.getDay(today);
      if (todayData) {
        todayData.goal = state.profile.dailyGoal;
        todayData.isSuccess = todayData.totalCalories <= todayData.goal;
        LocalDB.setDay(today, todayData);
      }

      navigate('home');
    });
  }

  function recalcGoalPreview() {
    const gender = document.querySelector('.gender-btn.selected')?.dataset.gender;
    const age = parseInt(document.getElementById('input-age')?.value);
    const weight = parseFloat(document.getElementById('input-weight')?.value);
    const height = parseFloat(document.getElementById('input-height')?.value);
    const targetWeight = parseFloat(document.getElementById('input-target')?.value);
    const activityLevel = document.getElementById('input-activity')?.value;
    const preview = document.getElementById('goal-preview-number');
    if (!preview) return;

    if (gender && age && weight && height && targetWeight && activityLevel) {
      preview.textContent = formatNumber(calculateDailyGoal(weight, height, age, gender, activityLevel, targetWeight));
      preview.classList.remove('opacity-30');
    } else {
      preview.textContent = '—'; preview.classList.add('opacity-30');
    }
  }

  // ======================
  // INITIALIZATION
  // ======================
  function init() {
    state.firebaseReady = isFirebaseConfigured();

    // Handle redirect result (returning from Google login on iOS/mobile)
    auth.getRedirectResult().catch((e) => {
      console.warn('Redirect result error:', e.message);
      if (e.code !== 'auth/credential-already-in-use') {
        showToast('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
      }
    });

    // Listen for auth state changes
    auth.onAuthStateChanged(async (user) => {
      // Hide splash
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.style.transition = 'opacity 0.4s ease';
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 400);
      }

      if (user) {
        // User is signed in
        state.user = user;
        state.userId = user.uid;
        console.log('Signed in as:', user.displayName, user.uid);

        const hasProfile = await loadProfile();

        // Setup nav events (only once)
        setupNavEvents();

        if (!hasProfile) {
          navigate('settings');
        } else {
          navigate('home');
          if (state.firebaseReady) subscribeFirebaseToday();
        }
      } else {
        // Not signed in, show login
        state.user = null;
        state.userId = null;
        showLoginPage();
      }

      state.isLoading = false;
    });
  }

  let navBound = false;
  function setupNavEvents() {
    if (navBound) return;
    navBound = true;

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
    document.getElementById('btn-top-settings')?.addEventListener('click', () => navigate('settings'));
  }

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW failed:', err));
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => e.preventDefault());

  // Start
  document.addEventListener('DOMContentLoaded', init);

})();
