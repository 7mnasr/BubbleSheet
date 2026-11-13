// =========================================================================
// 1. STATE MANAGEMENT & LOCALSTORAGE PERSISTENCE
// =========================================================================
const STORAGE_KEY = 'smart_bubble_sheet_v1';
const THEME_KEY = 'smart_bubble_sheet_theme';
const TUTORIAL_DISMISSED_KEY = 'smart_bubble_sheet_tutorial_done';
const COLOR_THEME_KEY = 'smart_bubble_sheet_color_theme';
const ACTIVE_HW_KEY = 'smart_bubble_sheet_active_hw_id';
const RETRY_FLAG_KEY = 'smart_bubble_sheet_is_retry';

let selectedInitTheme = 'blue';

let appState = {
    userProfile: null, // { name, gender, colorTheme, createdAt }
    homeworks: [], // Array of Homework Objects
    solveMode: 'standard', // 'standard' or 'auto'
};

// Transient runtime state
let pendingParsedQuestions = null;
let pendingParsedLang = 'ar';
let currentHomeworkId = null;
let currentQuestionIndex = 0;
let hasUnsavedChanges = false;
let dashboardFilter = 'all';
let isRetrySession = false;
let pendingTargetUrl = null;

const ERROR_REASONS = [
    'عوضت غلط',
    'اخترت غلط سهواً',
    'مش فاهم الفكرة',
    'متلخبط / ناسي قاعدة'
];

function getCurrentPage() {
    return document.body.dataset.page || 'home';
}

function initApp() {
    initTheme();
    generateHomeScreenAppIcon();

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.homeworks)) {
                appState.homeworks = parsed.homeworks;
                appState.solveMode = parsed.solveMode || 'standard';
                appState.userProfile = parsed.userProfile || null;
            }
        }
    } catch (e) {
        console.error('Error loading localStorage:', e);
    }

    const savedColor = (appState.userProfile && appState.userProfile.colorTheme)
        || localStorage.getItem(COLOR_THEME_KEY)
        || 'blue';
    applyColorTheme(savedColor, false);

    setupBeforeUnloadGuard();
    updateGlobalStats();
    applyUserPersonalization();

    const page = getCurrentPage();
    updateActiveNavHighlight(page);

    if (page === 'home') {
        setupDragAndDrop();
        refreshAllUI();
    } else if (page === 'solve') {
        setupKeyboardShortcuts();
        initSolvePage();
    } else if (page === 'dashboard') {
        initDashboardPage();
    } else if (page === 'mistakes') {
        renderMistakesHub();
    }

    // Check if user profile exists on this device; if not, show welcome/restore prompt first
    if (!appState.userProfile) {
        showUserInitStep('ask');
        openModal('user-init-modal');
    } else if (page === 'home' && localStorage.getItem(TUTORIAL_DISMISSED_KEY) !== 'true') {
        openTutorialFromStart();
    }
}

function updateActiveNavHighlight(page) {
    const homeBtn = document.getElementById('nav-home-btn');
    const mistakesBtn = document.getElementById('nav-mistakes-btn');
    if (!homeBtn || !mistakesBtn) return;

    if (page === 'home') {
        homeBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
        mistakesBtn.className = 'relative px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
    } else if (page === 'mistakes') {
        mistakesBtn.className = 'relative px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300';
        homeBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
    } else {
        homeBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
        mistakesBtn.className = 'relative px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
    }
}

// Generate crisp PNG icon dynamically for mobile Home Screen shortcut (apple-touch-icon)
function generateHomeScreenAppIcon() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 180, 180);
        grad.addColorStop(0, '#1e3a8a');
        grad.addColorStop(1, '#3b82f6');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(0, 0, 180, 180, 40);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.strokeRect(38, 44, 38, 38);
        ctx.beginPath();
        ctx.moveTo(94, 63);
        ctx.lineTo(142, 63);
        ctx.stroke();

        ctx.strokeRect(38, 98, 38, 38);
        ctx.beginPath();
        ctx.moveTo(94, 117);
        ctx.lineTo(142, 117);
        ctx.stroke();

        ctx.strokeStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(47, 63);
        ctx.lineTo(55, 71);
        ctx.lineTo(69, 54);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(47, 117);
        ctx.lineTo(55, 125);
        ctx.lineTo(69, 108);
        ctx.stroke();

        const link = document.getElementById('apple-touch-icon-link');
        if (link) link.href = canvas.toDataURL('image/png');
    } catch (e) {}
}

// =========================================================================
// 1.2 USER PROFILE, COLOR THEMES & FIRST-TIME ONBOARDING
// =========================================================================
function applyColorTheme(themeName, saveToProfile = false) {
    const validThemes = ['blue', 'pink', 'green', 'red', 'purple'];
    const theme = validThemes.includes(themeName) ? themeName : 'blue';
    document.documentElement.setAttribute('data-color-theme', theme);
    localStorage.setItem(COLOR_THEME_KEY, theme);

    const themeHexMap = {
        blue: '#1e3a8a',
        pink: '#831843',
        green: '#064e3b',
        red: '#7f1d1d',
        purple: '#4c1d95'
    };
    const metaColor = document.getElementById('meta-theme-color');
    if (metaColor) metaColor.setAttribute('content', themeHexMap[theme]);

    document.querySelectorAll('.edit-theme-btn').forEach(btn => {
        if (btn.dataset.editTval === theme) {
            btn.classList.add('border-slate-900', 'dark:border-white', 'bg-slate-100', 'dark:bg-slate-800');
        } else {
            btn.classList.remove('border-slate-900', 'dark:border-white', 'bg-slate-100', 'dark:bg-slate-800');
        }
    });

    if (saveToProfile && appState.userProfile) {
        appState.userProfile.colorTheme = theme;
        persistState();
    }
}

function showUserInitStep(step) {
    ['ask', 'restore', 'new'].forEach(s => {
        const el = document.getElementById(`user-init-step-${s}`);
        if (el) el.classList.toggle('hidden', s !== step);
    });
}

function suggestThemeByGender(gender) {
    if (gender === 'female') {
        selectInitColorTheme('pink');
    } else {
        selectInitColorTheme('blue');
    }
}

function selectInitColorTheme(themeName) {
    selectedInitTheme = themeName;
    applyColorTheme(themeName, false);
    document.querySelectorAll('.init-theme-btn').forEach(btn => {
        if (btn.dataset.tval === themeName) {
            btn.className = 'init-theme-btn p-2.5 rounded-xl border-2 border-blue-900 bg-blue-50 dark:bg-blue-950/50 flex flex-col items-center gap-1.5 transition-all scale-105';
        } else {
            btn.className = 'init-theme-btn p-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 flex flex-col items-center gap-1.5 transition-all';
        }
    });
}

function saveNewUserProfile(e) {
    e.preventDefault();
    const name = document.getElementById('init-user-name').value.trim();
    const genderEl = document.querySelector('input[name="init-gender"]:checked');
    if (!name || !genderEl) return;

    appState.userProfile = {
        name,
        gender: genderEl.value,
        colorTheme: selectedInitTheme,
        createdAt: new Date().toISOString()
    };
    applyColorTheme(selectedInitTheme, true);
    persistState();
    applyUserPersonalization();
    closeModal('user-init-modal');

    showToast(
        genderEl.value === 'female'
            ? `نورتي الموقع يا ${name}! تم تجهيز ملفك بنجاح.`
            : `نورت الموقع يا ${name}! تم تجهيز ملفك بنجاح.`,
        'success'
    );

    if (getCurrentPage() === 'home' && localStorage.getItem(TUTORIAL_DISMISSED_KEY) !== 'true') {
        openTutorialFromStart();
    }
}

function handleInitialBackupRestore(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.homeworks)) {
                throw new Error('Invalid backup file');
            }
            appState.homeworks = data.homeworks;
            appState.solveMode = data.solveMode || 'standard';
            appState.userProfile = data.userProfile || {
                name: 'بطل المذاكرة',
                gender: 'male',
                colorTheme: 'blue',
                createdAt: new Date().toISOString()
            };

            applyColorTheme(appState.userProfile.colorTheme || 'blue', true);
            persistState();
            refreshAllUI();
            applyUserPersonalization();
            closeModal('user-init-modal');
            localStorage.setItem(TUTORIAL_DISMISSED_KEY, 'true');

            showToast(`أهلاً بعودتك يا ${appState.userProfile.name}! تم استرجاع كل بياناتك بنجاح.`, 'success');
        } catch (err) {
            showToast('الملف ده مش ملف نسخة احتياطية سليم! تأكد من اختيار الملف الصح.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function applyUserPersonalization() {
    const profile = appState.userProfile;
    const nameEl = document.getElementById('header-user-name');
    const headingEl = document.getElementById('home-welcome-heading');
    if (!profile) return;

    if (nameEl) nameEl.textContent = profile.name;
    if (headingEl) {
        const greeting = profile.gender === 'female'
            ? `أهلاً بيكي يا ${profile.name} 👋 ابدئي بابل شيت جديد`
            : `أهلاً بيك يا ${profile.name} 👋 ابدأ بابل شيت جديد`;
        headingEl.textContent = greeting;
    }
}

function openProfileSettingsModal() {
    const profile = appState.userProfile || { name: '', gender: 'male', colorTheme: 'blue' };
    document.getElementById('edit-user-name').value = profile.name || '';
    const genderRadio = document.querySelector(`input[name="edit-gender"][value="${profile.gender || 'male'}"]`);
    if (genderRadio) genderRadio.checked = true;
    applyColorTheme(profile.colorTheme || 'blue', false);
    openModal('profile-settings-modal');
}

function updateExistingUserProfile(e) {
    e.preventDefault();
    const name = document.getElementById('edit-user-name').value.trim();
    const genderEl = document.querySelector('input[name="edit-gender"]:checked');
    const currentTheme = localStorage.getItem(COLOR_THEME_KEY) || 'blue';
    if (!name) return;

    appState.userProfile = {
        ...(appState.userProfile || {}),
        name,
        gender: genderEl ? genderEl.value : 'male',
        colorTheme: currentTheme
    };
    persistState();
    applyUserPersonalization();
    closeModal('profile-settings-modal');
    showToast('تم حفظ بياناتك وتحديث الثيم بنجاح!', 'success');
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
        showToast('ذاكرة المتصفح ممتلئة! حاول تصدير نسخة احتياطية أو تقليل حجم الصور المرفقة.', 'error');
    }
}

// =========================================================================
// 1.5 FIRST-TIME WELCOME & INTERACTIVE GRAPHIC TUTORIAL
// =========================================================================
function openTutorialFromStart() {
    goToTutorialStep(0);
    openModal('onboarding-modal');
}

function goToTutorialStep(stepIndex) {
    [0, 1, 2, 3].forEach(idx => {
        const el = document.getElementById(`tut-step-${idx}`);
        if (el) el.classList.toggle('hidden', idx !== stepIndex);
    });
    if (stepIndex === 1) {
        replayTutorialAnimation(1);
    }
}

function replayTutorialAnimation(step) {
    if (step === 1) {
        const stage = document.getElementById('tut-anim-stage-1');
        if (!stage) return;
        const clone = stage.cloneNode(true);
        stage.parentNode.replaceChild(clone, stage);
    }
}

function dismissTutorialForever() {
    localStorage.setItem(TUTORIAL_DISMISSED_KEY, 'true');
    closeModal('onboarding-modal');
}

// =========================================================================
// 2. THEME MANAGEMENT (DARK / LIGHT MODE)
// =========================================================================
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
        updateThemeIcon(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateThemeIcon(false);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = isDark ? 'ph-bold ph-sun text-lg text-amber-400' : 'ph-bold ph-moon text-lg';
    }
}

// =========================================================================
// 3. MULTI-PAGE NAVIGATION & ROUTER
// =========================================================================
const PAGE_ROUTES = {
    home: 'index.html',
    solve: 'solve.html',
    dashboard: 'dashboard.html',
    mistakes: 'mistakes.html'
};

function navigateTo(viewName) {
    const targetUrl = PAGE_ROUTES[viewName] || 'index.html';
    if (getCurrentPage() === 'solve' && viewName !== 'solve' && hasUnsavedChanges) {
        pendingTargetUrl = targetUrl;
        openModal('unsaved-modal');
        return;
    }
    window.location.href = targetUrl;
}

function attemptExitSolve() {
    if (hasUnsavedChanges) {
        pendingTargetUrl = 'index.html';
        openModal('unsaved-modal');
    } else {
        window.location.href = 'index.html';
    }
}

function confirmDiscardAndExit() {
    hasUnsavedChanges = false;
    closeModal('unsaved-modal');
    window.location.href = pendingTargetUrl || 'index.html';
}

function saveAndExitSolve() {
    saveCurrentProgress(false);
    closeModal('unsaved-modal');
    window.location.href = pendingTargetUrl || 'index.html';
}

function setupBeforeUnloadGuard() {
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// =========================================================================
// 4. ANSWER KEY UPLOAD, MANUAL CREATION & DEMO HOMEWORK
// =========================================================================
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-800', 'bg-blue-50/50', 'dark:bg-blue-950/30');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-800', 'bg-blue-50/50', 'dark:bg-blue-950/30');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) processAnswerKeyFile(file);
    });
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) processAnswerKeyFile(file);
    event.target.value = '';
}

function processAnswerKeyFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let content = e.target.result.trim();
            content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
            const data = JSON.parse(content);

            if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
                throw new Error('ملف الإجابات لا يحتوي على قائمة أسئلة صحيحة.');
            }

            const normalizedQuestions = data.questions.map((q, idx) => {
                const qType = (q.type === 'essay') ? 'essay' : 'mcq';
                let ans = String(q.answer || '').trim();
                if (qType === 'mcq') {
                    if (ans === 'ا') ans = 'أ';
                    if (['a', 'b', 'c', 'd'].includes(ans.toLowerCase())) ans = ans.toUpperCase();
                }
                return {
                    number: (q.number !== undefined && q.number !== null && String(q.number).trim() !== '') ? String(q.number).trim() : String(idx + 1),
                    type: qType,
                    correctAnswer: ans,
                    userAnswer: null,
                    essayRevealed: false,
                    essayScore: null,
                    flagged: false,
                    status: 'unanswered',
                    errorReason: '',
                    understood: false,
                    note: '',
                    questionText: '',
                    questionImage: ''
                };
            });

            pendingParsedQuestions = normalizedQuestions;
            pendingParsedLang = (data.language === 'en') ? 'en' : 'ar';

            populateSubjectsDatalist();

            document.getElementById('parsed-q-count').textContent = normalizedQuestions.length;
            document.getElementById('meta-lang').value = pendingParsedLang;
            document.getElementById('metadata-setup-card').classList.remove('hidden');
            document.getElementById('metadata-setup-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('تم قراءة نموذج الإجابة! اكتب بيانات الواجب للبدء.', 'success');
        } catch (err) {
            showToast('صيغة الملف غير صحيحة! تأكد إنك نسخت كود JSON صح من الذكاء الاصطناعي.', 'error');
        }
    };
    reader.readAsText(file);
}

function cancelMetadataSetup() {
    pendingParsedQuestions = null;
    document.getElementById('metadata-setup-card').classList.add('hidden');
}

function startNewHomework(e) {
    e.preventDefault();
    if (!pendingParsedQuestions) return;

    const subject = document.getElementById('meta-subject').value.trim();
    const book = document.getElementById('meta-book').value.trim();
    const chapter = document.getElementById('meta-chapter').value.trim();
    const lesson = document.getElementById('meta-lesson').value.trim();
    const language = document.getElementById('meta-lang').value;

    const newHw = {
        id: 'hw_' + Date.now(),
        subject,
        book,
        chapter,
        lesson,
        language,
        createdAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'in_progress',
        isManual: false,
        manualPhase: null,
        manualOrder: null,
        questions: pendingParsedQuestions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(newHw);
    persistState();

    document.getElementById('homework-metadata-form').reset();
    document.getElementById('metadata-setup-card').classList.add('hidden');
    pendingParsedQuestions = null;

    openSolveView(newHw.id);
}

// Manual Homework Setup & Two-Phase Logic
function openManualSetupModal() {
    populateSubjectsDatalist();
    openModal('manual-setup-modal');
}

function startManualHomework(startOrder) {
    const subject = document.getElementById('man-subject').value.trim();
    const book = document.getElementById('man-book').value.trim();
    const chapter = document.getElementById('man-chapter').value.trim();
    const lesson = document.getElementById('man-lesson').value.trim();
    const qCount = parseInt(document.getElementById('man-qcount').value, 10);
    const language = document.getElementById('man-lang').value;

    if (!subject || !book || !chapter || !lesson || !qCount || qCount < 1) {
        showToast('من فضلك املا كل البيانات وعدد الأسئلة الأول!', 'error');
        return;
    }

    const questions = Array.from({ length: qCount }, (_, i) => ({
        number: i + 1,
        type: 'mcq',
        correctAnswer: null,
        userAnswer: null,
        essayRevealed: false,
        essayScore: null,
        flagged: false,
        status: 'unanswered',
        errorReason: '',
        understood: false,
        note: '',
        questionText: '',
        questionImage: ''
    }));

    const newHw = {
        id: 'hw_man_' + Date.now(),
        subject,
        book,
        chapter,
        lesson,
        language,
        createdAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'in_progress',
        isManual: true,
        manualOrder: startOrder,
        manualPhase: startOrder === 'user_first' ? 'user' : 'key',
        questions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(newHw);
    persistState();

    document.getElementById('manual-homework-form').reset();
    closeModal('manual-setup-modal');

    openSolveView(newHw.id);
}

function loadDemoHomework() {
    const demoQuestions = [
        { number: 1, type: 'mcq', correctAnswer: 'أ' },
        { number: 2, type: 'mcq', correctAnswer: 'ج' },
        { number: 3, type: 'mcq', correctAnswer: 'ب' },
        { number: 4, type: 'mcq', correctAnswer: 'د' },
        { number: 5, type: 'mcq', correctAnswer: 'ب' },
        { number: 6, type: 'mcq', correctAnswer: 'أ' },
        { number: 7, type: 'mcq', correctAnswer: 'ج' },
        { number: 8, type: 'mcq', correctAnswer: 'د' },
        { number: 9, type: 'mcq', correctAnswer: 'أ' },
        { number: 10, type: 'essay', correctAnswer: 'لأن المقاومة النوعية تتوقف على نوع المادة ودرجة الحرارة فقط، ولا تتغير بتغير طول السلك أو مساحة مقطعه.' }
    ].map(q => ({
        ...q,
        userAnswer: null,
        essayRevealed: false,
        essayScore: null,
        flagged: false,
        status: 'unanswered',
        errorReason: '',
        understood: false,
        note: '',
        questionText: '',
        questionImage: ''
    }));

    const demoHw = {
        id: 'hw_demo_' + Date.now(),
        subject: 'الفيزياء',
        book: 'كتاب الامتحان (نموذج تجريبي)',
        chapter: 'الفصل الأول: التيار الكهربي',
        lesson: 'الدرس الثاني: المقاومة النوعية',
        language: 'ar',
        createdAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'in_progress',
        isManual: false,
        manualPhase: null,
        manualOrder: null,
        questions: demoQuestions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(demoHw);
    persistState();
    openSolveView(demoHw.id);
}

function openAiPromptModal() {
    openModal('ai-prompt-modal');
}

function copyAiPrompt() {
    const textarea = document.getElementById('ai-prompt-text');
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        showToast('تم نسخ البرومت! ابعته لـ Gemini مع صور نموذج الإجابة.', 'success');
        closeModal('ai-prompt-modal');
    } catch (err) {
        showToast('تعذر النسخ التلقائي، حدد النص وانسخه يدوياً.', 'error');
    }
}

// =========================================================================
// 5. SMART BUBBLE SHEET SOLVING ENGINE (NORMAL + MANUAL TWO-PHASE)
// =========================================================================
function openSolveView(hwId, isRetry = false) {
    localStorage.setItem(ACTIVE_HW_KEY, hwId);
    if (isRetry) {
        localStorage.setItem(RETRY_FLAG_KEY, 'true');
    } else {
        localStorage.removeItem(RETRY_FLAG_KEY);
    }
    window.location.href = 'solve.html';
}

function initSolvePage() {
    const params = new URLSearchParams(window.location.search);
    const hwId = params.get('id') || localStorage.getItem(ACTIVE_HW_KEY);
    const hw = appState.homeworks.find(h => h.id === hwId);

    if (!hw) {
        window.location.href = 'index.html';
        return;
    }

    currentHomeworkId = hwId;
    isRetrySession = localStorage.getItem(RETRY_FLAG_KEY) === 'true' || hwId.startsWith('retry_');
    hasUnsavedChanges = false;

    const firstUnanswered = hw.questions.findIndex(q => !isQuestionAnsweredInCurrentPhase(hw, q));
    currentQuestionIndex = firstUnanswered !== -1 ? firstUnanswered : 0;

    document.getElementById('solve-subject-badge').textContent = hw.subject;
    document.getElementById('solve-title').textContent = `${hw.book} • ${hw.chapter} • ${hw.lesson}`;

    updateSolveModeUI();
    updateManualPhaseBannerUI(hw);
    renderCurrentQuestion();
    renderQuestionMap();
}

function isEnteringKeyPhase(hw) {
    return hw && hw.isManual && hw.manualPhase === 'key';
}

function isQuestionAnsweredInCurrentPhase(hw, q) {
    if (isEnteringKeyPhase(hw)) {
        return q.correctAnswer !== null && q.correctAnswer !== '';
    }
    if (q.type === 'mcq') return q.userAnswer !== null && q.userAnswer !== '';
    if (q.type === 'essay') return q.essayScore !== null;
    return false;
}

function updateManualPhaseBannerUI(hw) {
    const banner = document.getElementById('manual-phase-banner');
    const submitBtnText = document.getElementById('main-submit-btn-text');
    const submitBtn = document.getElementById('main-submit-btn');
    const legendDot = document.getElementById('legend-answered-dot');
    const legendLabel = document.getElementById('legend-answered-label');

    if (!hw || !hw.isManual) {
        banner.classList.add('hidden');
        submitBtnText.textContent = 'تسليم الواجب';
        submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        legendDot.className = 'w-3 h-3 rounded bg-blue-900 inline-block';
        legendLabel.textContent = 'متجاوب';
        return;
    }

    banner.classList.remove('hidden');
    const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                  || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');

    const stepBadge = document.getElementById('manual-phase-step-badge');
    const titleEl = document.getElementById('manual-phase-title');
    const descEl = document.getElementById('manual-phase-desc');
    const switchBtn = document.getElementById('manual-phase-switch-btn');
    const iconWrap = document.getElementById('manual-phase-icon');

    if (isEnteringKeyPhase(hw)) {
        banner.className = 'rounded-2xl p-3.5 sm:p-4 border-2 border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-3 animate-pop';
        iconWrap.className = 'w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0';
        iconWrap.innerHTML = '<i class="ph-bold ph-check-circle text-xl"></i>';
        stepBadge.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200';
        stepBadge.textContent = isPhase1 ? 'المرحلة ١ من ٢ • إدخال النموذج' : 'المرحلة ٢ من ٢ • إدخال النموذج';
        titleEl.textContent = 'حط إجابات النموذج الصح دلوقتي ✅';
        descEl.textContent = isPhase1
            ? 'سجّل الإجابات الصحيحة من النموذج اللي معاك، وبعد ما تخلص اضغط "ابدأ حل إجاباتي".'
            : 'سجّل الإجابات الصحيحة من النموذج عشان نصحح إجاباتك فوراً ونطلع النتيجة!';

        if (isPhase1) {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>خلصت النموذج، ابدأ حل إجاباتي</span><i class="ph-bold ph-arrow-left"></i>';
            submitBtnText.textContent = 'الانتقال لحل إجاباتي';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        } else {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>احسب النتيجة وصحّح الآن</span><i class="ph-bold ph-check"></i>';
            submitBtnText.textContent = 'تصحيح وعرض النتيجة';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        }
        legendDot.className = 'w-3 h-3 rounded bg-emerald-600 inline-block';
        legendLabel.textContent = 'متسجل بالنموذج';
    } else {
        banner.className = 'rounded-2xl p-3.5 sm:p-4 border-2 border-blue-700 bg-blue-50/80 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 flex flex-wrap items-center justify-between gap-3 animate-pop';
        iconWrap.className = 'w-10 h-10 rounded-xl bg-blue-900 text-white flex items-center justify-center shrink-0';
        iconWrap.innerHTML = '<i class="ph-bold ph-pencil-simple text-xl"></i>';
        stepBadge.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200';
        stepBadge.textContent = isPhase1 ? 'المرحلة ١ من ٢ • إجاباتك' : 'المرحلة ٢ من ٢ • إجاباتك';
        titleEl.textContent = 'اختار إجاباتك أنت دلوقتي ✍️';
        descEl.textContent = isPhase1
            ? 'اختار إجاباتك لكل سؤال، ولما تخلص اضغط "حط نموذج الإجابة للتصحيح".'
            : 'نموذج الإجابة متسجل وجاهز! اختار إجاباتك وبعدين اضغط "تسليم الواجب".';

        if (isPhase1) {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>حط نموذج الإجابة للتصحيح</span><i class="ph-bold ph-arrow-left"></i>';
            submitBtnText.textContent = 'الانتقال لإدخال النموذج';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-indigo-700 hover:bg-indigo-600 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        } else {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>تسليم وتصحيح الواجب</span><i class="ph-bold ph-paper-plane-tilt"></i>';
            submitBtnText.textContent = 'تسليم الواجب';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        }
        legendDot.className = 'w-3 h-3 rounded bg-blue-900 inline-block';
        legendLabel.textContent = 'متجاوب';
    }
}

function handleManualPhaseAction() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw || !hw.isManual) return;

    const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                  || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');

    if (isPhase1) {
        switchToSecondManualPhase(hw);
    } else {
        initiateSubmitHomework();
    }
}

function switchToSecondManualPhase(hw) {
    hw.manualPhase = (hw.manualPhase === 'user') ? 'key' : 'user';
    currentQuestionIndex = 0;
    hasUnsavedChanges = true;
    persistState();

    updateManualPhaseBannerUI(hw);
    renderCurrentQuestion();
    renderQuestionMap();

    showToast(
        hw.manualPhase === 'key'
            ? 'المرحلة ٢: حط بقى إجابات النموذج الصح بنفسك!'
            : 'المرحلة ٢: اختار إجاباتك أنت دلوقتي!',
        'success'
    );
}

function setSolveMode(mode) {
    appState.solveMode = mode;
    persistState();
    updateSolveModeUI();
    showToast(mode === 'auto' ? 'تم تفعيل النمط السريع (ينقل تلقائياً)' : 'تم التبديل للنمط العادي', 'info');
}

function updateSolveModeUI() {
    const stdBtn = document.getElementById('mode-standard-btn');
    const autoBtn = document.getElementById('mode-auto-btn');
    if (!stdBtn || !autoBtn) return;

    if (appState.solveMode === 'standard') {
        stdBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-700 text-blue-900 dark:text-white shadow-sm';
        autoBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 dark:text-slate-400 flex items-center gap-1';
    } else {
        autoBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-blue-900 text-white shadow-sm flex items-center gap-1';
        stdBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 dark:text-slate-400';
    }
}

function renderCurrentQuestion() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const q = hw.questions[currentQuestionIndex];
    const total = hw.questions.length;
    const keyMode = isEnteringKeyPhase(hw);

    const answeredCount = hw.questions.filter(item => isQuestionAnsweredInCurrentPhase(hw, item)).length;
    document.getElementById('solve-progress-text').textContent = keyMode
        ? `تم تسجيل ${answeredCount} من ${total} إجابة في النموذج`
        : `تم حل ${answeredCount} من ${total} سؤال`;
    document.getElementById('map-answered-ratio').textContent = `${answeredCount} / ${total}`;

    document.getElementById('q-number-display').textContent = formatQuestionLabel(q.number);
    document.getElementById('q-total-display').textContent = `(عنصر ${currentQuestionIndex + 1} من ${total})`;
    const splitBtn = document.getElementById('split-subq-btn');
    if (splitBtn) splitBtn.classList.toggle('hidden', isRetrySession);
    document.getElementById('q-type-badge').textContent = keyMode
        ? 'إدخال إجابة النموذج'
        : (q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي (تقييم ذاتي)');

    const attachBox = document.getElementById('retry-attachment-box');
    const qTextEl = document.getElementById('retry-q-text');
    const qImgWrap = document.getElementById('retry-q-img-wrap');
    const qImgEl = document.getElementById('retry-q-img');
    const originMetaEl = document.getElementById('retry-origin-meta');

    if (q.questionText || q.questionImage || q.originLabel) {
        attachBox.classList.remove('hidden');
        originMetaEl.textContent = q.originLabel || '';
        if (q.questionText) {
            qTextEl.textContent = q.questionText;
            qTextEl.classList.remove('hidden');
        } else {
            qTextEl.classList.add('hidden');
        }
        if (q.questionImage) {
            qImgEl.src = q.questionImage;
            qImgWrap.classList.remove('hidden');
        } else {
            qImgWrap.classList.add('hidden');
        }
    } else {
        attachBox.classList.add('hidden');
    }

    const flagBtn = document.getElementById('flag-q-btn');
    const flagIcon = document.getElementById('flag-icon');
    if (q.flagged) {
        flagBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center gap-1.5';
        flagIcon.className = 'ph-fill ph-flag text-base text-amber-500';
    } else {
        flagBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-1.5';
        flagIcon.className = 'ph-bold ph-flag text-base';
    }

    document.getElementById('prev-q-btn').disabled = (currentQuestionIndex === 0);
    document.getElementById('next-q-btn').disabled = (currentQuestionIndex === total - 1);

    const mcqContainer = document.getElementById('mcq-container');
    const essayContainer = document.getElementById('essay-container');
    const mcqInst = document.getElementById('mcq-instruction-text');

    mcqInst.textContent = keyMode
        ? 'اختر الإجابة الصحيحة الموجودة في نموذج الإجابة (أو بالكيبورد 1-4):'
        : 'اختر الإجابة الصحيحة من البابل شيت (أو استخدم الكيبورد 1-4):';

    if (q.type === 'mcq' || keyMode) {
        mcqContainer.classList.remove('hidden');
        essayContainer.classList.add('hidden');
        renderMcqOptions(hw, q, keyMode);
    } else {
        mcqContainer.classList.add('hidden');
        essayContainer.classList.remove('hidden');
        renderEssayBox(q);
    }
}

function renderMcqOptions(hw, q, keyMode = false) {
    const grid = document.getElementById('mcq-options-grid');
    const isEnglish = hw.language === 'en';
    const options = isEnglish ? ['A', 'B', 'C', 'D'] : ['أ', 'ب', 'ج', 'د'];
    const labels = isEnglish ? ['Option A', 'Option B', 'Option C', 'Option D'] : ['الاختيار الأول', 'الاختيار الثاني', 'الاختيار الثالث', 'الاختيار الرابع'];

    const currentVal = keyMode ? q.correctAnswer : q.userAnswer;

    grid.dir = isEnglish ? 'ltr' : 'rtl';
    grid.innerHTML = options.map((opt, idx) => {
        const isSelected = (currentVal === opt);
        const selectedTheme = keyMode
            ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg scale-[1.01]'
            : 'border-blue-900 bg-blue-900 text-white shadow-lg scale-[1.01]';
        const baseClasses = isSelected
            ? selectedTheme
            : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 hover:border-blue-700 dark:hover:border-blue-500 text-slate-800 dark:text-slate-100';
        const circleClasses = isSelected
            ? (keyMode ? 'bg-white text-emerald-700 font-black' : 'bg-white text-blue-900 font-black')
            : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-extrabold';

        return `
            <button type="button" onclick="selectMcqOption('${opt}')" class="p-4 sm:p-5 rounded-2xl border-2 transition-all flex items-center gap-4 text-start active:scale-95 ${baseClasses}">
                <span class="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${isEnglish ? 'font-en' : ''} ${circleClasses}">
                    ${opt}
                </span>
                <div class="flex-1">
                    <span class="font-extrabold text-base sm:text-lg block ${isEnglish ? 'font-en' : ''}">${opt}</span>
                    <span class="text-xs ${isSelected ? 'text-white/80' : 'text-slate-400'}">${labels[idx]}</span>
                </div>
                ${isSelected ? '<i class="ph-fill ph-check-circle text-2xl text-white"></i>' : ''}
            </button>
        `;
    }).join('');
}

function selectMcqOption(option) {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const q = hw.questions[currentQuestionIndex];
    const keyMode = isEnteringKeyPhase(hw);

    if (keyMode) {
        q.correctAnswer = option;
    } else {
        q.userAnswer = option;
    }
    hasUnsavedChanges = true;

    renderCurrentQuestion();
    renderQuestionMap();

    const isLastQuestion = (currentQuestionIndex === hw.questions.length - 1);

    if (appState.solveMode === 'auto' && !isLastQuestion) {
        setTimeout(() => {
            currentQuestionIndex++;
            renderCurrentQuestion();
            renderQuestionMap();
        }, 180);
    } else if (isLastQuestion && hw.isManual) {
        const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                      || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');
        if (isPhase1) {
            setTimeout(() => {
                showToast(
                    hw.manualPhase === 'user'
                        ? 'وصلت لآخر سؤال! اضغط "حط نموذج الإجابة للتصحيح" فوق أو تحت.'
                        : 'سجّلت آخر سؤال في النموذج! اضغط "ابدأ حل إجاباتي" للتصحيح.',
                    'info'
                );
            }, 220);
        }
    }
}

function renderEssayBox(q) {
    const textEl = document.getElementById('essay-model-text');
    const overlay = document.getElementById('essay-reveal-overlay');
    const gradingBox = document.getElementById('essay-grading-box');

    textEl.textContent = q.correctAnswer;

    if (q.essayRevealed || q.essayScore !== null) {
        textEl.classList.remove('essay-blur');
        overlay.classList.add('hidden');
        gradingBox.classList.remove('hidden');
    } else {
        textEl.classList.add('essay-blur');
        overlay.classList.remove('hidden');
        gradingBox.classList.add('hidden');
    }

    document.querySelectorAll('.essay-score-btn').forEach(btn => {
        const sc = parseFloat(btn.dataset.score);
        if (q.essayScore === sc) {
            btn.className = 'essay-score-btn py-3.5 rounded-xl font-black text-base sm:text-lg border-2 border-blue-900 bg-blue-900 text-white shadow-md';
        } else {
            btn.className = 'essay-score-btn py-3.5 rounded-xl font-black text-base sm:text-lg border-2 border-slate-200 dark:border-slate-700 hover:border-blue-700 transition-all';
        }
    });
}

function revealEssayAnswer() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    hw.questions[currentQuestionIndex].essayRevealed = true;
    hasUnsavedChanges = true;
    renderCurrentQuestion();
}

function gradeEssay(score) {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    hw.questions[currentQuestionIndex].essayScore = score;
    hasUnsavedChanges = true;
    renderCurrentQuestion();
    renderQuestionMap();
}

function formatQuestionLabel(numVal) {
    const s = String(numVal ?? '').trim();
    const match = s.match(/^([^(\s]+)\s*\(([^)]+)\)$/);
    if (match) {
        return `سؤال ${match[1]} - مطلوب (${match[2]})`;
    }
    return `سؤال ${s}`;
}

function formatCompactMapNumber(numVal) {
    const s = String(numVal ?? '').trim();
    const match = s.match(/^([^(\s]+)\s*\(([^)]+)\)$/);
    if (match) {
        return `${match[1]}.${match[2]}`;
    }
    return s;
}

function openSubQuestionsModal() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    const q = hw.questions[currentQuestionIndex];
    const baseNum = String(q.number).replace(/\s*\([^)]*\)$/, '').trim();
    document.getElementById('subq-target-label').textContent = `سؤال ${baseNum}`;

    const existingParts = hw.questions.filter(item => {
        const itemBase = String(item.number).replace(/\s*\([^)]*\)$/, '').trim();
        return itemBase === baseNum;
    });
    document.getElementById('subq-count-input').value = existingParts.length >= 2 ? existingParts.length : 2;
    openModal('subquestions-modal');
}

function applySubQuestionsSplit(e) {
    e.preventDefault();
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const count = parseInt(document.getElementById('subq-count-input').value, 10);
    if (!count || count < 2 || count > 50) {
        showToast('اختار عدد مطاليب بين 2 و 50', 'error');
        return;
    }

    const currentQ = hw.questions[currentQuestionIndex];
    const baseNum = String(currentQ.number).replace(/\s*\([^)]*\)$/, '').trim();

    const matchingIndices = [];
    hw.questions.forEach((item, idx) => {
        const itemBase = String(item.number).replace(/\s*\([^)]*\)$/, '').trim();
        if (itemBase === baseNum) matchingIndices.push(idx);
    });

    const firstIdx = matchingIndices[0];
    const existingItems = matchingIndices.map(i => hw.questions[i]);

    const newSubQuestions = Array.from({ length: count }, (_, i) => {
        const prev = existingItems[i];
        if (prev) {
            return {
                ...prev,
                number: `${baseNum} (${i + 1})`
            };
        }
        return {
            number: `${baseNum} (${i + 1})`,
            type: currentQ.type || 'mcq',
            correctAnswer: null,
            userAnswer: null,
            essayRevealed: false,
            essayScore: null,
            flagged: false,
            status: 'unanswered',
            errorReason: '',
            understood: false,
            note: '',
            questionText: '',
            questionImage: ''
        };
    });

    hw.questions.splice(firstIdx, matchingIndices.length, ...newSubQuestions);
    currentQuestionIndex = firstIdx;
    hasUnsavedChanges = true;
    persistState();

    closeModal('subquestions-modal');
    renderCurrentQuestion();
    renderQuestionMap();
    showToast(`تم تفريع سؤال ${baseNum} إلى ${count} مطاليب مع الحفاظ على ترتيب الكتاب!`, 'success');
}

function clearCurrentAnswer() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    const q = hw.questions[currentQuestionIndex];
    if (isEnteringKeyPhase(hw)) {
        q.correctAnswer = null;
    } else {
        q.userAnswer = null;
        q.essayScore = null;
    }
    hasUnsavedChanges = true;
    renderCurrentQuestion();
    renderQuestionMap();
    showToast('تم تصفير الاختيار', 'info');
}

function toggleFlagCurrent() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    hw.questions[currentQuestionIndex].flagged = !hw.questions[currentQuestionIndex].flagged;
    hasUnsavedChanges = true;
    renderCurrentQuestion();
    renderQuestionMap();
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderCurrentQuestion();
        renderQuestionMap();
    }
}

function nextQuestion() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (hw && currentQuestionIndex < hw.questions.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion();
        renderQuestionMap();
    }
}

function jumpToQuestion(index) {
    currentQuestionIndex = index;
    renderCurrentQuestion();
    renderQuestionMap();
}

function renderQuestionMap() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const keyMode = isEnteringKeyPhase(hw);
    const grid = document.getElementById('question-map-grid');
    grid.innerHTML = hw.questions.map((q, idx) => {
        const answered = isQuestionAnsweredInCurrentPhase(hw, q);
        const isCurrent = (idx === currentQuestionIndex);

        let colorClasses = answered
            ? (keyMode
                ? 'bg-emerald-600 dark:bg-emerald-700 text-white font-extrabold shadow-sm'
                : 'bg-blue-900 dark:bg-blue-800 text-white font-extrabold shadow-sm')
            : 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 font-semibold';

        let ringClasses = isCurrent
            ? 'ring-2 ring-offset-2 ring-blue-600 dark:ring-blue-400 dark:ring-offset-slate-900 scale-105'
            : '';

        const compactNum = formatCompactMapNumber(q.number);
        const isSub = String(q.number).includes('(') || String(q.number).includes('.');
        return `
            <button type="button" onclick="jumpToQuestion(${idx})" title="${escapeHtml(formatQuestionLabel(q.number))}" class="relative h-10 rounded-xl ${isSub ? 'text-[10px] font-en tracking-tighter' : 'text-xs'} flex items-center justify-center transition-all ${colorClasses} ${ringClasses}">
                ${escapeHtml(compactNum)}
                ${q.flagged ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900"></span>' : ''}
            </button>
        `;
    }).join('');
}

function saveCurrentProgress(showNotification = true) {
    persistState();
    hasUnsavedChanges = false;
    if (showNotification) {
        showToast('تم حفظ تقدمك بنجاح! تقدر تكمل في أي وقت.', 'success');
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (getCurrentPage() !== 'solve') return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
        if (!hw) return;
        const q = hw.questions[currentQuestionIndex];
        const isEn = hw.language === 'en';
        const opts = isEn ? ['A', 'B', 'C', 'D'] : ['أ', 'ب', 'ج', 'د'];

        if (q.type === 'mcq' || isEnteringKeyPhase(hw)) {
            if (['1', '2', '3', '4'].includes(e.key)) {
                selectMcqOption(opts[parseInt(e.key) - 1]);
            } else if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
                const idx = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
                selectMcqOption(opts[idx]);
            }
        }

        if (e.key === 'ArrowLeft') nextQuestion();
        if (e.key === 'ArrowRight') prevQuestion();
        if (e.key.toLowerCase() === 'f') toggleFlagCurrent();
    });
}

// =========================================================================
// 6. SMART SUBMISSION & GRADING LOGIC
// =========================================================================
function initiateSubmitHomework() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    if (hw.isManual) {
        const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                      || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');
        if (isPhase1) {
            switchToSecondManualPhase(hw);
            return;
        }

        const missingKeysForAnswered = hw.questions.filter(q => q.userAnswer && !q.correctAnswer).length;
        if (missingKeysForAnswered > 0) {
            showToast(`فيه ${missingKeysForAnswered} سؤال إنت جاوبته بس لسه محطتش إجابته الصح في النموذج!`, 'error');
            return;
        }
    }

    const unansweredCount = hw.questions.filter(q => !(q.type === 'mcq' ? q.userAnswer : q.essayScore !== null)).length;

    if (unansweredCount > 0) {
        document.getElementById('unanswered-modal-count').textContent = unansweredCount;
        document.getElementById('total-modal-count').textContent = hw.questions.length;
        openModal('partial-submit-modal');
    } else {
        finalizeSubmission('complete');
    }
}

function finalizeSubmission(mode) {
    closeModal('partial-submit-modal');
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    let earned = 0;
    let max = 0;

    hw.questions.forEach(q => {
        const answered = (q.type === 'mcq') ? Boolean(q.userAnswer) : (q.essayScore !== null);
        const qMax = (q.type === 'essay') ? 2 : 1;

        if (!answered && mode === 'partial') {
            q.status = 'skipped_unrevealed';
            return;
        }

        if (hw.isManual && !q.correctAnswer && !answered) {
            q.status = 'skipped_unrevealed';
            return;
        }

        max += qMax;

        if (!answered && mode === 'all_wrong') {
            q.status = 'wrong';
            return;
        }

        if (q.type === 'mcq') {
            if (q.userAnswer === q.correctAnswer) {
                q.status = 'correct';
                earned += 1;
            } else {
                q.status = 'wrong';
            }
        } else if (q.type === 'essay') {
            const sc = parseFloat(q.essayScore) || 0;
            earned += sc;
            if (sc === 2) q.status = 'correct';
            else if (sc > 0) q.status = 'partial';
            else q.status = 'wrong';
        }
    });

    hw.scoreEarned = earned;
    hw.scoreMax = max;
    hw.percentage = max > 0 ? Math.round((earned / max) * 100) : 0;
    hw.status = (mode === 'partial') ? 'partial' : 'completed';

    if (isRetrySession && hw.originMap) {
        syncRetryResultsToOriginals(hw);
        appState.homeworks = appState.homeworks.filter(h => h.id !== hw.id);
        localStorage.removeItem(RETRY_FLAG_KEY);
        persistState();
        hasUnsavedChanges = false;
        window.location.href = 'mistakes.html';
        return;
    }

    hasUnsavedChanges = false;
    persistState();
    openDashboardView(hw.id);
}

function syncRetryResultsToOriginals(retryHw) {
    retryHw.questions.forEach((rq, idx) => {
        const origin = retryHw.originMap[idx];
        if (!origin) return;
        const origHw = appState.homeworks.find(h => h.id === origin.hwId);
        if (!origHw) return;
        const origQ = origHw.questions[origin.qIdx];
        if (origQ && rq.status === 'correct') {
            origQ.understood = true;
        }
    });
}

// =========================================================================
// 7. RESULTS DASHBOARD, ERROR ANALYSIS & QUESTION TEXT/IMAGE ATTACHMENT
// =========================================================================
function openDashboardView(hwId) {
    localStorage.setItem(ACTIVE_HW_KEY, hwId);
    window.location.href = 'dashboard.html';
}

function initDashboardPage() {
    const params = new URLSearchParams(window.location.search);
    const hwId = params.get('id') || localStorage.getItem(ACTIVE_HW_KEY);
    const hw = appState.homeworks.find(h => h.id === hwId);

    if (!hw) {
        window.location.href = 'index.html';
        return;
    }

    currentHomeworkId = hwId;
    dashboardFilter = 'all';

    document.getElementById('dash-subject-tag').textContent = hw.subject;
    document.getElementById('dash-hw-title').textContent = `${hw.book} • ${hw.lesson}`;
    document.getElementById('dash-hw-subtitle').textContent = `${hw.chapter} • تاريخ التسليم: ${hw.createdAt}`;

    const statusBadge = document.getElementById('dash-status-badge');
    const resumePartialBtn = document.getElementById('dash-resume-partial-btn');

    if (hw.status === 'partial') {
        statusBadge.textContent = 'تسليم جزئي';
        statusBadge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
        resumePartialBtn.classList.remove('hidden');
    } else {
        statusBadge.textContent = 'مكتمل ومصحح';
        statusBadge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
        resumePartialBtn.classList.add('hidden');
    }

    const correctCount = hw.questions.filter(q => q.status === 'correct').length;
    const wrongCount = hw.questions.filter(q => q.status === 'wrong').length;
    const partialCount = hw.questions.filter(q => q.status === 'partial' || q.status === 'skipped_unrevealed').length;

    document.getElementById('dash-score-fraction').textContent = `${hw.scoreEarned} / ${hw.scoreMax}`;
    document.getElementById('dash-score-percent').textContent = `${hw.percentage}%`;
    document.getElementById('dash-correct-count').textContent = correctCount;
    document.getElementById('dash-wrong-count').textContent = wrongCount;
    document.getElementById('dash-partial-count').textContent = partialCount;

    updateDashboardFilterButtons();
    renderDashboardQuestions();
}

function resumeFromDashboard() {
    if (currentHomeworkId) {
        const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
        if (hw && hw.isManual) {
            hw.manualPhase = 'user';
            persistState();
        }
        openSolveView(currentHomeworkId);
    }
}

function setDashboardFilter(filter) {
    dashboardFilter = filter;
    updateDashboardFilterButtons();
    renderDashboardQuestions();
}

function updateDashboardFilterButtons() {
    document.querySelectorAll('.dash-filter-btn').forEach(btn => {
        if (btn.dataset.dfilter === dashboardFilter) {
            btn.className = 'dash-filter-btn px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white';
        } else {
            btn.className = 'dash-filter-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
        }
    });
}

function renderDashboardQuestions() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const container = document.getElementById('dash-questions-list');
    const filtered = hw.questions.map((q, idx) => ({ q, idx })).filter(({ q }) => {
        if (dashboardFilter === 'wrong') return q.status === 'wrong';
        if (dashboardFilter === 'partial') return q.status === 'partial' || q.status === 'skipped_unrevealed';
        if (dashboardFilter === 'flagged') return q.flagged;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 font-bold">مفيش أسئلة في الفلتر ده!</div>`;
        return;
    }

    container.innerHTML = filtered.map(({ q, idx }) => {
        let cardBorder = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
        let badgeHtml = '';

        if (q.status === 'correct') {
            cardBorder = 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/15';
            badgeHtml = '<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">صح ✅</span>';
        } else if (q.status === 'wrong') {
            cardBorder = 'border-rose-300 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/15';
            badgeHtml = '<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">غلط ❌</span>';
        } else if (q.status === 'partial') {
            cardBorder = 'border-amber-300 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/15';
            badgeHtml = `<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">درجة جزئية (${q.essayScore}/2) 🟡</span>`;
        } else {
            cardBorder = 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10';
            badgeHtml = '<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">متروك (تسليم جزئي) 🟡</span>';
        }

        let comparisonHtml = '';
        if (q.status === 'skipped_unrevealed') {
            comparisonHtml = `<p class="text-xs text-slate-500 dark:text-slate-400 italic">لم يتم حل هذا السؤال بعد — الإجابة مخفية عشان تقدر تحله بنفسك لاحقاً.</p>`;
        } else if (q.type === 'mcq') {
            comparisonHtml = `
                <div class="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                    <span>إجابتك: <strong class="px-2.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 ${hw.language === 'en' ? 'font-en' : ''}">${q.userAnswer || 'لم تجب'}</strong></span>
                    <span>الإجابة النموذجية: <strong class="px-2.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 ${hw.language === 'en' ? 'font-en' : ''}">${q.correctAnswer || '-'}</strong></span>
                </div>
            `;
        } else {
            comparisonHtml = `
                <div class="text-xs sm:text-sm space-y-1">
                    <span class="text-slate-500">تقييمك لنفسك: <strong>${q.essayScore ?? 0} من 2</strong></span>
                    <p class="p-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 font-semibold">${q.correctAnswer}</p>
                </div>
            `;
        }

        let errorAnalysisHtml = '';
        if (q.status === 'wrong' || q.status === 'partial') {
            errorAnalysisHtml = `
                <div class="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                        <div class="md:col-span-4">
                            <select onchange="updateQuestionErrorMeta('${hw.id}', ${idx}, 'errorReason', this.value)" class="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                                <option value="">-- اختر سبب الغلط --</option>
                                ${ERROR_REASONS.map(r => `<option value="${r}" ${q.errorReason === r ? 'selected' : ''}>${r}</option>`).join('')}
                            </select>
                        </div>
                        <div class="md:col-span-3">
                            <button type="button" onclick="toggleQuestionUnderstood('${hw.id}', ${idx})" class="w-full px-3 py-2 rounded-xl text-xs font-extrabold border transition-all ${q.understood ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800'}">
                                ${q.understood ? 'فهمت غلطي خلاص ✅' : 'لسه مفهمتوش ❌'}
                            </button>
                        </div>
                        <div class="md:col-span-5">
                            <input type="text" value="${escapeHtml(q.note || '')}" onchange="updateQuestionErrorMeta('${hw.id}', ${idx}, 'note', this.value)" placeholder="ملاحظة شخصية سريعة (قانون / تنبيه)..." class="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                        </div>
                    </div>

                    <div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-xs font-extrabold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                                <i class="ph-bold ph-image text-base"></i> إرفاق السؤال نفسه (كتابة أو صورة مخطط/جدول):
                            </span>
                            <div class="flex items-center gap-2">
                                <label class="cursor-pointer px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1 transition-colors">
                                    <i class="ph-bold ph-camera-plus text-sm"></i>
                                    <span>${q.questionImage ? 'تغيير الصورة' : 'ارفع صورة السؤال'}</span>
                                    <input type="file" accept="image/*" class="hidden" onchange="handleQuestionImageUpload(event, '${hw.id}', ${idx})">
                                </label>
                                ${q.questionImage ? `
                                    <button type="button" onclick="removeQuestionImage('${hw.id}', ${idx})" class="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 text-xs font-bold hover:bg-rose-100">
                                        حذف الصورة
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <textarea rows="2" onchange="updateQuestionErrorMeta('${hw.id}', ${idx}, 'questionText', this.value)" placeholder="اكتب نص السؤال هنا (أو ارفع صورته لو فيه رسمة أو جدول عشان تلاقيه في وشك في الاختبار)..." class="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-600 focus:outline-none">${escapeHtml(q.questionText || '')}</textarea>

                        ${q.questionImage ? `
                            <div class="pt-1">
                                <img src="${q.questionImage}" alt="صورة السؤال" onclick="openImageLightbox(this.src)" class="max-h-48 rounded-xl border border-slate-300 dark:border-slate-600 cursor-zoom-in object-contain bg-white">
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="rounded-2xl p-4 border ${cardBorder} transition-all">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-black text-base">${escapeHtml(formatQuestionLabel(q.number))}</span>
                        ${badgeHtml}
                        ${q.flagged ? '<span class="text-amber-500 text-xs font-bold"><i class="ph-fill ph-flag"></i> مراجعة</span>' : ''}
                    </div>
                    ${comparisonHtml}
                </div>
                ${errorAnalysisHtml}
            </div>
        `;
    }).join('');
}

function handleQuestionImageUpload(event, hwId, qIdx) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 900;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
            updateQuestionErrorMeta(hwId, qIdx, 'questionImage', compressedDataUrl);

            if (getCurrentPage() === 'dashboard') {
                renderDashboardQuestions();
            }
            if (getCurrentPage() === 'mistakes') {
                renderMistakesHub();
            }
            showToast('تم حفظ صورة السؤال! هتظهرلك في وشك لما تراجع أو تختبر نفسك.', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function removeQuestionImage(hwId, qIdx) {
    updateQuestionErrorMeta(hwId, qIdx, 'questionImage', '');
    if (getCurrentPage() === 'dashboard') {
        renderDashboardQuestions();
    }
    if (getCurrentPage() === 'mistakes') {
        renderMistakesHub();
    }
    showToast('تم حذف صورة السؤال.', 'info');
}

function openImageLightbox(src) {
    document.getElementById('lightbox-img-el').src = src;
    openModal('image-lightbox-modal');
}

function updateQuestionErrorMeta(hwId, qIdx, field, value) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    hw.questions[qIdx][field] = value;
    persistState();
    updateGlobalStats();
}

function toggleQuestionUnderstood(hwId, qIdx) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    hw.questions[qIdx].understood = !hw.questions[qIdx].understood;
    persistState();
    updateGlobalStats();
    if (getCurrentPage() === 'dashboard') {
        renderDashboardQuestions();
    }
    if (getCurrentPage() === 'mistakes') {
        renderMistakesHub();
    }
}

// =========================================================================
// 8. "أخطائي" (MY MISTAKES HUB, ANALYTICS & RETRY MODE WITH ATTACHMENTS)
// =========================================================================
function getAllMistakes() {
    const list = [];
    appState.homeworks.forEach(hw => {
        if (hw.status === 'in_progress') return;
        hw.questions.forEach((q, qIdx) => {
            if (q.status === 'wrong' || q.status === 'partial') {
                list.push({
                    hwId: hw.id,
                    qIdx,
                    subject: hw.subject,
                    book: hw.book,
                    chapter: hw.chapter,
                    lesson: hw.lesson,
                    language: hw.language,
                    question: q
                });
            }
        });
    });
    return list;
}

function renderMistakesHub() {
    const allMistakes = getAllMistakes();

    const subjSelect = document.getElementById('mistakes-filter-subject');
    if (!subjSelect) return;

    const currentSubjVal = subjSelect.value;
    const subjects = [...new Set(appState.homeworks.map(h => h.subject))];
    subjSelect.innerHTML = `<option value="all">كل المواد (${subjects.length})</option>` +
        subjects.map(s => `<option value="${escapeHtml(s)}" ${currentSubjVal === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');

    renderSubjectPerformanceAndImprovement(subjects);
    renderErrorRadarChart(allMistakes);

    const fSubj = subjSelect.value;
    const fReason = document.getElementById('mistakes-filter-reason').value;
    const fStatus = document.getElementById('mistakes-filter-status').value;

    const filtered = allMistakes.filter(item => {
        if (fSubj !== 'all' && item.subject !== fSubj) return false;
        if (fReason !== 'all') {
            const r = item.question.errorReason || 'غير محدد';
            if (r !== fReason) return false;
        }
        if (fStatus === 'understood' && !item.question.understood) return false;
        if (fStatus === 'ununderstood' && item.question.understood) return false;
        return true;
    });

    const retryBtn = document.getElementById('retry-mistakes-btn');
    document.getElementById('retry-count-label').textContent = filtered.length;
    retryBtn.disabled = (filtered.length === 0);

    const container = document.getElementById('mistakes-grouped-container');
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
                <i class="ph-bold ph-smiley text-5xl text-emerald-500 mb-2"></i>
                <h4 class="font-extrabold text-lg">مفيش أخطاء مطابقة للفلتر ده!</h4>
                <p class="text-xs text-slate-500 mt-1">عاش يا بطل، استمر في المذاكرة!</p>
            </div>
        `;
        return;
    }

    const groups = {};
    filtered.forEach(item => {
        const key = `${item.subject}|||${item.chapter} - ${item.lesson}|||${item.book}`;
        if (!groups[key]) {
            groups[key] = {
                subject: item.subject,
                lessonPath: `${item.chapter} • ${item.lesson}`,
                book: item.book,
                items: []
            };
        }
        groups[key].items.push(item);
    });

    container.innerHTML = Object.values(groups).map(group => `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300">${escapeHtml(group.subject)}</span>
                        <h4 class="font-extrabold text-base">${escapeHtml(group.lessonPath)}</h4>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                        <i class="ph-bold ph-book-open text-blue-700 dark:text-blue-400"></i>
                        المصدر: <strong>${escapeHtml(group.book)}</strong>
                    </p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                    ${group.items.length} أخطاء
                </span>
            </div>

            <div class="space-y-3">
                ${group.items.map(item => {
                    const q = item.question;
                    return `
                        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-sm px-2.5 py-1 rounded-lg bg-rose-500 text-white">${escapeHtml(formatQuestionLabel(q.number))}</span>
                                    ${q.type === 'mcq'
                                        ? `<span class="text-xs">إجابتك: <strong class="text-rose-600 ${item.language === 'en' ? 'font-en' : ''}">${q.userAnswer || 'متروك'}</strong> | الصح: <strong class="text-emerald-600 ${item.language === 'en' ? 'font-en' : ''}">${q.correctAnswer}</strong></span>`
                                        : `<span class="text-xs font-bold text-amber-600">مقالي (${q.essayScore}/2)</span>`
                                    }
                                </div>

                                <button type="button" onclick="toggleQuestionUnderstood('${item.hwId}', ${item.qIdx})" class="px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${q.understood ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-rose-600 border-rose-300 dark:border-rose-800'}">
                                    ${q.understood ? 'فهمت غلطي خلاص ✅' : 'لسه مفهمتوش ❌'}
                                </button>
                            </div>

                            ${(q.questionText || q.questionImage) ? `
                                <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200/70 dark:border-indigo-800/50 space-y-2">
                                    ${q.questionText ? `<p class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-pre-line">${escapeHtml(q.questionText)}</p>` : ''}
                                    ${q.questionImage ? `<img src="${q.questionImage}" alt="صورة السؤال" onclick="openImageLightbox(this.src)" class="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in object-contain bg-white">` : ''}
                                </div>
                            ` : ''}

                            <div class="flex flex-wrap items-center gap-2">
                                <label class="cursor-pointer px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1">
                                    <i class="ph-bold ph-camera-plus"></i>
                                    <span>${q.questionImage ? 'تغيير صورة السؤال' : 'إضافة صورة للسؤال'}</span>
                                    <input type="file" accept="image/*" class="hidden" onchange="handleQuestionImageUpload(event, '${item.hwId}', ${item.qIdx})">
                                </label>
                                ${q.questionImage ? `<button type="button" onclick="removeQuestionImage('${item.hwId}', ${item.qIdx})" class="text-[11px] font-bold text-rose-500 hover:underline">حذف الصورة</button>` : ''}
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select onchange="updateQuestionErrorMeta('${item.hwId}', ${item.qIdx}, 'errorReason', this.value); renderErrorRadarChart(getAllMistakes());" class="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <option value="">-- سبب الغلط --</option>
                                    ${ERROR_REASONS.map(r => `<option value="${r}" ${q.errorReason === r ? 'selected' : ''}>${r}</option>`).join('')}
                                </select>
                                <input type="text" value="${escapeHtml(q.note || '')}" onchange="updateQuestionErrorMeta('${item.hwId}', ${item.qIdx}, 'note', this.value)" placeholder="ملاحظة شخصية..." class="px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
}

function renderSubjectPerformanceAndImprovement(subjects) {
    const grid = document.getElementById('subjects-analytics-grid');
    if (subjects.length === 0) {
        grid.innerHTML = `<div class="col-span-full p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">سلم أول واجب عشان تشوف نسبة مستواك ومؤشر التحسن لكل مادة.</div>`;
        return;
    }

    grid.innerHTML = subjects.map(subj => {
        const gradedHws = appState.homeworks
            .filter(h => h.subject === subj && h.status !== 'in_progress' && h.scoreMax > 0)
            .slice()
            .reverse();

        if (gradedHws.length === 0) {
            return `
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                    <h4 class="font-extrabold text-sm">${escapeHtml(subj)}</h4>
                    <p class="text-xs text-slate-400 mt-1">لم يتم تسليم واجبات مصححة بعد</p>
                </div>
            `;
        }

        const avgPercent = Math.round(gradedHws.reduce((acc, h) => acc + h.percentage, 0) / gradedHws.length);

        let improvementHtml = `<span class="text-[11px] text-slate-400">أول واجب مسجل</span>`;
        if (gradedHws.length >= 2) {
            const latest = gradedHws[gradedHws.length - 1].percentage;
            const prevList = gradedHws.slice(0, gradedHws.length - 1);
            const prevAvg = prevList.reduce((acc, h) => acc + h.percentage, 0) / prevList.length;
            const diff = Math.round(latest - prevAvg);

            if (diff > 0) {
                improvementHtml = `<span class="inline-flex items-center gap-0.5 text-xs font-extrabold text-emerald-600 dark:text-emerald-400"><i class="ph-bold ph-trend-up"></i> +${diff}% تحسن</span>`;
            } else if (diff < 0) {
                improvementHtml = `<span class="inline-flex items-center gap-0.5 text-xs font-extrabold text-rose-600 dark:text-rose-400"><i class="ph-bold ph-trend-down"></i> ${diff}% تراجع</span>`;
            } else {
                improvementHtml = `<span class="text-xs font-bold text-slate-500">ثبات في المستوى (0%)</span>`;
            }
        }

        return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
                <div class="flex items-center justify-between">
                    <h4 class="font-extrabold text-base">${escapeHtml(subj)}</h4>
                    <span class="text-xl font-black text-blue-900 dark:text-blue-400">${avgPercent}%</span>
                </div>
                <div class="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-900 dark:bg-blue-500 rounded-full" style="width: ${avgPercent}%"></div>
                </div>
                <div class="flex items-center justify-between text-xs pt-1">
                    <span class="text-slate-500">${gradedHws.length} واجبات</span>
                    ${improvementHtml}
                </div>
            </div>
        `;
    }).join('');
}

function renderErrorRadarChart(allMistakes) {
    const container = document.getElementById('error-radar-bars');
    const total = allMistakes.length || 1;

    container.innerHTML = ERROR_REASONS.map(reason => {
        const count = allMistakes.filter(m => m.question.errorReason === reason).length;
        const pct = allMistakes.length > 0 ? Math.round((count / total) * 100) : 0;

        return `
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-2">
                <div class="flex items-center justify-between text-xs font-extrabold">
                    <span>${reason}</span>
                    <span class="text-rose-600 dark:text-rose-400">${pct}% (${count})</span>
                </div>
                <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-rose-500 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function startRetryMistakesSession() {
    const allMistakes = getAllMistakes();
    const fSubj = document.getElementById('mistakes-filter-subject').value;
    const fReason = document.getElementById('mistakes-filter-reason').value;
    const fStatus = document.getElementById('mistakes-filter-status').value;

    const filtered = allMistakes.filter(item => {
        if (fSubj !== 'all' && item.subject !== fSubj) return false;
        if (fReason !== 'all' && (item.question.errorReason || 'غير محدد') !== fReason) return false;
        if (fStatus === 'understood' && !item.question.understood) return false;
        if (fStatus === 'ununderstood' && item.question.understood) return false;
        return true;
    });

    if (filtered.length === 0) return;

    const originMap = [];
    const retryQuestions = filtered.map((item, idx) => {
        originMap.push({ hwId: item.hwId, qIdx: item.qIdx });
        return {
            number: idx + 1,
            type: item.question.type,
            correctAnswer: item.question.correctAnswer,
            userAnswer: null,
            essayRevealed: false,
            essayScore: null,
            flagged: false,
            status: 'unanswered',
            errorReason: '',
            understood: false,
            note: '',
            questionText: item.question.questionText || '',
            questionImage: item.question.questionImage || '',
            originLabel: `${item.subject} • ${item.book} • ${item.chapter} • ${item.lesson} (${formatQuestionLabel(item.question.number)})`
        };
    });

    const retryHw = {
        id: 'retry_' + Date.now(),
        subject: fSubj !== 'all' ? fSubj : 'مراجعة شاملة',
        book: 'اختبرني في غلطاتي',
        chapter: 'أسئلة مختارة من أخطائك',
        lesson: `${retryQuestions.length} سؤال`,
        language: filtered[0].language || 'ar',
        createdAt: new Date().toLocaleDateString('ar-EG'),
        status: 'in_progress',
        isManual: false,
        questions: retryQuestions,
        originMap
    };

    appState.homeworks = appState.homeworks.filter(h => !h.id.startsWith('retry_'));
    appState.homeworks.unshift(retryHw);
    persistState();
    openSolveView(retryHw.id, true);
}

// =========================================================================
// 9. HOME ARCHIVE, GLOBAL STATS & DATA PORTABILITY (BACKUP / SHARE)
// =========================================================================
function refreshAllUI() {
    updateGlobalStats();
    populateSubjectsDatalist();
    renderHomeArchive();
}

function updateGlobalStats() {
    const completed = appState.homeworks.filter(h => h.status !== 'in_progress' && !h.id.startsWith('retry_'));
    const allMistakes = getAllMistakes();
    const ununderstood = allMistakes.filter(m => !m.question.understood).length;
    const understood = allMistakes.filter(m => m.question.understood).length;

    const avgScore = completed.length > 0
        ? Math.round(completed.reduce((acc, h) => acc + h.percentage, 0) / completed.length)
        : 0;

    const elTotal = document.getElementById('stat-total-hw');
    const elAvg = document.getElementById('stat-avg-score');
    const elUn = document.getElementById('stat-ununderstood');
    const elUnd = document.getElementById('stat-understood');
    const elBadge = document.getElementById('mistakes-badge');

    if (elTotal) elTotal.textContent = completed.length;
    if (elAvg) elAvg.textContent = `${avgScore}%`;
    if (elUn) elUn.textContent = ununderstood;
    if (elUnd) elUnd.textContent = understood;
    if (elBadge) elBadge.textContent = ununderstood;
}

function populateSubjectsDatalist() {
    const subjects = [...new Set(appState.homeworks.map(h => h.subject))];
    const datalist = document.getElementById('subjects-datalist');
    if (datalist) {
        datalist.innerHTML = subjects.map(s => `<option value="${escapeHtml(s)}">`).join('');
    }

    const filterSelect = document.getElementById('archive-subject-filter');
    if (filterSelect) {
        const cur = filterSelect.value;
        filterSelect.innerHTML = `<option value="all">كل المواد</option>` +
            subjects.map(s => `<option value="${escapeHtml(s)}" ${cur === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    }
}

function renderHomeArchive() {
    const container = document.getElementById('homeworks-archive-list');
    const filterEl = document.getElementById('archive-subject-filter');
    if (!container || !filterEl) return;

    const filterSubj = filterEl.value;
    const list = appState.homeworks.filter(h => !h.id.startsWith('retry_') && (filterSubj === 'all' || h.subject === filterSubj));

    if (list.length === 0) {
        container.innerHTML = `
            <div class="col-span-full bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800">
                <p class="font-bold text-slate-500 dark:text-slate-400">مفيش واجبات محفوظة لسه. ارفع أول ملف إجابات، أنشئ واجب يدوي، أو جرّب الواجب التجريبي!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(hw => {
        let statusPill = '';
        if (hw.status === 'in_progress') {
            statusPill = '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300">محفوظ - قيد الحل</span>';
        } else if (hw.status === 'partial') {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">مسلّم جزئياً (${hw.percentage}%)</span>`;
        } else {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">مكتمل (${hw.percentage}%)</span>`;
        }

        return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <span class="text-xs font-extrabold text-blue-900 dark:text-blue-400">${escapeHtml(hw.subject)}</span>
                        ${statusPill}
                    </div>
                    <h4 class="font-extrabold text-base line-clamp-1">${escapeHtml(hw.book)}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${escapeHtml(hw.chapter)} • ${escapeHtml(hw.lesson)}</p>
                    <p class="text-[11px] text-slate-400 mt-2">${hw.questions.length} سؤال • ${hw.createdAt}</p>
                </div>

                <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                        <button onclick="openSolveView('${hw.id}')" class="px-3 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1">
                            <i class="ph-bold ph-pencil-simple"></i>
                            <span>${hw.status === 'completed' ? 'إعادة الحل' : 'استكمال / حل'}</span>
                        </button>
                        ${hw.status !== 'in_progress' ? `
                            <button onclick="openDashboardView('${hw.id}')" class="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                                النتيجة
                            </button>
                        ` : ''}
                    </div>

                    <div class="flex items-center gap-1">
                        <button onclick="shareHomeworkKey('${hw.id}')" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="مشاركة ملف نموذج الإجابة مع أصحابك">
                            <i class="ph-bold ph-share-network text-base"></i>
                        </button>
                        <button onclick="deleteHomework('${hw.id}')" class="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title="حذف الواجب">
                            <i class="ph-bold ph-trash text-base"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function deleteHomework(hwId) {
    appState.homeworks = appState.homeworks.filter(h => h.id !== hwId);
    persistState();
    refreshAllUI();
    showToast('تم حذف الواجب من الأرشيف.', 'info');
}

function shareHomeworkKey(hwId) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;

    const cleanKey = {
        language: hw.language,
        questions: hw.questions.map(q => ({
            number: q.number,
            type: q.type,
            answer: q.correctAnswer || ''
        }))
    };

    downloadJsonFile(cleanKey, `نموذج_${hw.subject}_${hw.lesson}.json`);
    showToast('تم تحميل ملف نموذج الإجابة الصافي! ابعته لأصحابك يحلوه.', 'success');
}

function openBackupModal() {
    openModal('backup-modal');
}

function exportFullBackup() {
    const userNamePart = (appState.userProfile && appState.userProfile.name)
        ? `_${appState.userProfile.name.replace(/\s+/g, '_')}`
        : '';
    downloadJsonFile(appState, `ملف_البابل_شيت${userNamePart}_${new Date().toISOString().slice(0, 10)}.json`);
    showToast('تم تحميل ملفك الاحتياطي الشامل (الاسم + النماذج + الأخطاء) بنجاح!', 'success');
}

function importFullBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.homeworks)) {
                throw new Error('Invalid backup');
            }
            const existingIds = new Set(appState.homeworks.map(h => h.id));
            data.homeworks.forEach(hw => {
                if (!existingIds.has(hw.id)) {
                    appState.homeworks.push(hw);
                }
            });
            if (data.userProfile) {
                appState.userProfile = data.userProfile;
                applyColorTheme(data.userProfile.colorTheme || 'blue', true);
                applyUserPersonalization();
            }
            persistState();
            updateGlobalStats();

            const page = getCurrentPage();
            if (page === 'home') refreshAllUI();
            if (page === 'mistakes') renderMistakesHub();
            if (page === 'dashboard') initDashboardPage();

            closeModal('backup-modal');
            showToast('تم استيراد ودمج النسخة الاحتياطية بنجاح!', 'success');
        } catch (err) {
            showToast('ملف النسخة الاحتياطية غير صالح!', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function downloadJsonFile(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =========================================================================
// 10. UI HELPERS (MODALS, TOASTS & SANITIZATION)
// =========================================================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-600 text-white'
             : type === 'error' ? 'bg-rose-600 text-white'
             : 'bg-slate-900 dark:bg-slate-800 text-white border border-slate-700';

    toast.className = `${bg} px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2 pointer-events-auto animate-pop`;
    toast.innerHTML = `<i class="ph-bold ${type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : 'ph-info'} text-lg"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3400);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.addEventListener('DOMContentLoaded', initApp);
