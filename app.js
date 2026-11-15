// =========================================================================
// 1. STATE MANAGEMENT & LOCALSTORAGE PERSISTENCE
// =========================================================================
const STORAGE_KEY = 'smart_bubble_sheet_v2';
const THEME_KEY = 'smart_bubble_sheet_theme';
const TUTORIAL_DISMISSED_KEY = 'smart_bubble_sheet_tutorial_done';
const COLOR_THEME_KEY = 'smart_bubble_sheet_color_theme';
const ACTIVE_HW_KEY = 'smart_bubble_sheet_active_hw_id';
const ACTIVE_TEST_KEY = 'smart_bubble_sheet_active_test_id';
const RETRY_FLAG_KEY = 'smart_bubble_sheet_is_retry';

let selectedInitTheme = 'blue';

let appState = {
    userProfile: null, // { name, gender, colorTheme, createdAt }
    homeworks: [], // Array of Homework Objects
    tests: [],     // Array of Interactive Test Objects
    subjectIcons: {}, // { [subjectName]: iconKey }
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
let pendingDeleteHwId = null;

// Test runtime state
let currentTestId = null;
let currentTestQuestionIndex = 0;
let pendingTestObj = null;

// Homeworks Folders Explorer state
let folderNavState = { subject: null, book: null, chapter: null };
let folderSelectionMode = false;
let selectedExportHwIds = new Set();
let iconPickerTargetSubject = null;

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
                appState.tests = parsed.tests || [];
                appState.solveMode = parsed.solveMode || 'standard';
                appState.userProfile = parsed.userProfile || null;
                appState.subjectIcons = parsed.subjectIcons || {};
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
    } else if (page === 'homeworks') {
        initHomeworksExplorerPage();
    } else if (page === 'solve') {
        setupKeyboardShortcuts();
        initSolvePage();
    } else if (page === 'dashboard') {
        initDashboardPage();
    } else if (page === 'mistakes') {
        renderMistakesHub();
    } else if (page === 'tests') {
        initTestsPage();
    }

    if (!appState.userProfile) {
        showUserInitStep('ask');
        openModal('user-init-modal');
    } else if (page === 'home' && localStorage.getItem(TUTORIAL_DISMISSED_KEY) !== 'true') {
        openTutorialFromStart();
    }
}

function updateActiveNavHighlight(page) {
    const homeBtn = document.getElementById('nav-home-btn');
    const homeworksBtn = document.getElementById('nav-homeworks-btn');
    const mistakesBtn = document.getElementById('nav-mistakes-btn');
    const testsBtn = document.getElementById('nav-tests-btn');
    if (!homeBtn || !mistakesBtn) return;

    const inactiveBase = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
    homeBtn.className = inactiveBase;
    if (homeworksBtn) homeworksBtn.className = inactiveBase;
    if (testsBtn) testsBtn.className = inactiveBase;
    mistakesBtn.className = 'relative ' + inactiveBase;

    if (page === 'home') {
        homeBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
    } else if (page === 'homeworks' && homeworksBtn) {
        homeworksBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
    } else if (page === 'tests' && testsBtn) {
        testsBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
    } else if (page === 'mistakes') {
        mistakesBtn.className = 'relative px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300';
    }
}

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
        const link = document.getElementById('apple-touch-icon-link');
        if (link) link.href = canvas.toDataURL('image/png');
    } catch (e) {}
}

// =========================================================================
// 1.2 USER PROFILE & COLOR THEMES
// =========================================================================
function applyColorTheme(themeName, saveToProfile = false) {
    const validThemes = ['blue', 'pink', 'green', 'red', 'purple'];
    const theme = validThemes.includes(themeName) ? themeName : 'blue';
    document.documentElement.setAttribute('data-color-theme', theme);
    localStorage.setItem(COLOR_THEME_KEY, theme);
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
    if (gender === 'female') selectInitColorTheme('pink');
    else selectInitColorTheme('blue');
}

function selectInitColorTheme(themeName) {
    selectedInitTheme = themeName;
    applyColorTheme(themeName, false);
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
    showToast(`نورت الموقع يا ${name}!`, 'success');
}

function handleInitialBackupRestore(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.homeworks)) throw new Error('Invalid backup');
            appState.homeworks = data.homeworks;
            appState.tests = data.tests || [];
            appState.userProfile = data.userProfile || { name: 'بطل', gender: 'male', colorTheme: 'blue' };
            applyColorTheme(appState.userProfile.colorTheme || 'blue', true);
            persistState();
            refreshAllUI();
            closeModal('user-init-modal');
            showToast('تم استرجاع بياناتك بنجاح!', 'success');
        } catch (err) {
            showToast('ملف النسخة الاحتياطية غير سليم.', 'error');
        }
    };
    reader.readAsText(file);
}

function applyUserPersonalization() {
    const profile = appState.userProfile;
    const nameEl = document.getElementById('header-user-name');
    const headingEl = document.getElementById('home-welcome-heading');
    if (!profile) return;
    if (nameEl) nameEl.textContent = profile.name;
    if (headingEl) headingEl.textContent = `أهلاً بيك يا ${profile.name} 👋 ابدأ واجب أو اختبار جديد`;
}

function openProfileSettingsModal() {
    const profile = appState.userProfile || { name: '', gender: 'male', colorTheme: 'blue' };
    document.getElementById('edit-user-name').value = profile.name || '';
    openModal('profile-settings-modal');
}

function updateExistingUserProfile(e) {
    e.preventDefault();
    const name = document.getElementById('edit-user-name').value.trim();
    const genderEl = document.querySelector('input[name="edit-gender"]:checked');
    if (!name) return;
    appState.userProfile = { ...(appState.userProfile || {}), name, gender: genderEl ? genderEl.value : 'male' };
    persistState();
    applyUserPersonalization();
    closeModal('profile-settings-modal');
    showToast('تم حفظ الملف الشخصي بنجاح!', 'success');
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
        showToast('ذاكرة المتصفح ممتلئة!', 'error');
    }
}

// =========================================================================
// 2. THEME MANAGEMENT
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
    if (icon) icon.className = isDark ? 'ph-bold ph-sun text-lg text-amber-400' : 'ph-bold ph-moon text-lg';
}

// =========================================================================
// 3. ROUTER & NAVIGATION
// =========================================================================
const PAGE_ROUTES = {
    home: 'index.html',
    homeworks: 'homeworks.html',
    solve: 'solve.html',
    tests: 'tests.html',
    dashboard: 'dashboard.html',
    mistakes: 'mistakes.html'
};

function navigateTo(viewName) {
    const targetUrl = PAGE_ROUTES[viewName] || 'index.html';
    window.location.href = targetUrl;
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
// 4. HOMEWORK UPLOAD & ENGINE
// =========================================================================
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;
    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, e => e.preventDefault()));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => e.preventDefault()));
    dropZone.addEventListener('drop', e => {
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
            let content = e.target.result.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
            const data = JSON.parse(content);
            if (!data.questions || !Array.isArray(data.questions)) throw new Error('Invalid JSON');
            pendingParsedQuestions = data.questions.map((q, idx) => ({
                number: String(q.number || idx + 1),
                type: q.type || 'mcq',
                correctAnswer: String(q.answer || '').trim(),
                userAnswer: null,
                status: 'unanswered'
            }));
            document.getElementById('parsed-q-count').textContent = pendingParsedQuestions.length;
            document.getElementById('metadata-setup-card').classList.remove('hidden');
            showToast('تم قراءة نموذج الإجابة بنجاح!', 'success');
        } catch (err) {
            showToast('صيغة ملف الـ JSON غير صحيحة.', 'error');
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
    const newHw = {
        id: 'hw_' + Date.now(),
        subject: document.getElementById('meta-subject').value.trim(),
        book: document.getElementById('meta-book').value.trim(),
        chapter: document.getElementById('meta-chapter').value.trim(),
        lesson: document.getElementById('meta-lesson').value.trim(),
        language: document.getElementById('meta-lang').value,
        createdAt: new Date().toLocaleDateString('ar-EG'),
        status: 'in_progress',
        questions: pendingParsedQuestions,
        scoreEarned: 0, scoreMax: 0, percentage: 0
    };
    appState.homeworks.unshift(newHw);
    persistState();
    localStorage.setItem(ACTIVE_HW_KEY, newHw.id);
    window.location.href = 'solve.html';
}

function loadDemoHomework() {
    const demoHw = {
        id: 'hw_demo_' + Date.now(),
        subject: 'الفيزياء', book: 'كتاب الامتحان', chapter: 'الفصل الأول', lesson: 'الدرس الأول',
        language: 'ar', createdAt: new Date().toLocaleDateString('ar-EG'), status: 'in_progress',
        questions: [1,2,3,4,5].map(i => ({ number: String(i), type: 'mcq', correctAnswer: 'أ', userAnswer: null, status: 'unanswered' })),
        scoreEarned: 0, scoreMax: 5, percentage: 0
    };
    appState.homeworks.unshift(demoHw);
    persistState();
    localStorage.setItem(ACTIVE_HW_KEY, demoHw.id);
    window.location.href = 'solve.html';
}

// =========================================================================
// 5. INTERACTIVE TESTS & QUIZZES ENGINE (NEW FEATURE)
// =========================================================================
function initTestsPage() {
    renderTestsArchive();
}

function openTestAiPromptModal() {
    openModal('test-ai-prompt-modal');
}

function copyTestAiPrompt() {
    const ta = document.getElementById('test-ai-prompt-text');
    ta.select();
    try {
        document.execCommand('copy');
        showToast('تم نسخ برومت الاختبارات بنجاح!', 'success');
        closeModal('test-ai-prompt-modal');
    } catch (e) {
        showToast('تعذر النسخ التلقائي.', 'error');
    }
}

function handleTestFileUpload(event) {
    const file = event.target.files[0];
    if (file) processTestJsonFile(file);
    event.target.value = '';
}

function processTestJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let content = e.target.result.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
            const data = JSON.parse(content);
            if (!data.questions || !Array.isArray(data.questions)) throw new Error('Invalid test JSON');

            const newTest = {
                id: 'test_' + Date.now(),
                title: data.title || 'اختبار جديد',
                subject: data.subject || 'عام',
                book: data.book || 'مفكرة ذكية',
                passage: data.passage || '',
                createdAt: new Date().toLocaleDateString('ar-EG'),
                status: 'in_progress',
                scoreEarned: 0,
                scoreMax: data.questions.length,
                percentage: 0,
                questions: data.questions.map((q, idx) => ({
                    number: String(q.number || idx + 1),
                    type: q.type || 'mcq',
                    questionText: q.questionText || '',
                    questionImage: q.questionImage || '',
                    passage: q.passage || '',
                    options: q.options || { A: 'أ', B: 'ب', C: 'ج', D: 'د' },
                    correctAnswer: String(q.answer || '').trim(),
                    explanation: q.explanation || '',
                    userAnswer: null,
                    essayScore: null,
                    status: 'unanswered',
                    flagged: false
                }))
            };

            appState.tests.unshift(newTest);
            persistState();
            renderTestsArchive();
            showToast('تم استيراد الاختبار بنجاح! اضغط ابدأ الحل.', 'success');
        } catch (err) {
            showToast('ملف الاختبار غير صحيح! تأكد من توافق الـ JSON.', 'error');
        }
    };
    reader.readAsText(file);
}

function loadDemoTest() {
    const demoTest = {
        id: 'test_demo_' + Date.now(),
        title: 'اختبار تجريبي شامل في الفيزياء',
        subject: 'الفيزياء',
        book: 'كتاب الامتحان (تجريبي)',
        passage: 'قراءة مرجعية: التيار الكهربي هو تدفق للشحنات الكهربية عبر الموصلات، وتقاس شدته بالأمبير.',
        createdAt: new Date().toLocaleDateString('ar-EG'),
        status: 'in_progress',
        scoreEarned: 0,
        scoreMax: 3,
        percentage: 0,
        questions: [
            {
                number: '1',
                type: 'mcq',
                questionText: 'ما هي وحدة قياس شدة التيار الكهربي في النظام الدولي؟',
                passage: '',
                options: { A: 'الفولت', B: 'الأمبير', C: 'الأوم', D: 'الوات' },
                correctAnswer: 'B',
                explanation: 'شدة التيار تقاس بالأمبير (A).',
                userAnswer: null, status: 'unanswered', flagged: false
            },
            {
                number: '2',
                type: 'mcq',
                questionText: 'علاقة فرق الجهد بشدة التيار عند ثبوت درجة الحرارة (قانون أوم) هي علاقة:',
                passage: '',
                options: { A: 'عكسية', B: 'طردية خطية', C: 'ثابتة لا تتغير', D: 'منحنية' },
                correctAnswer: 'B',
                explanation: 'حسب قانون أوم V = IR، العلاقة طردية خطية.',
                userAnswer: null, status: 'unanswered', flagged: false
            },
            {
                number: '3',
                type: 'essay',
                questionText: 'اشرح لماذا لا تتغير المقاومة النوعية لمادة بتغير طول السلك أو مساحة مقطعه.',
                passage: '',
                options: null,
                correctAnswer: 'لأن المقاومة النوعية خاصية مميزة لمادة الموصل وتتوقف فقط على نوع المادة ودرجة الحرارة.',
                explanation: 'المقاومة النوعية لا تعتمد على الأبعاد الهندسية.',
                userAnswer: null, essayScore: null, status: 'unanswered', flagged: false
            }
        ]
    };
    appState.tests.unshift(demoTest);
    persistState();
    renderTestsArchive();
    showToast('تم إضافة الاختبار التجريبي بنجاح!', 'success');
}

function renderTestsArchive() {
    const container = document.getElementById('tests-archive-list');
    if (!container) return;

    if (appState.tests.length === 0) {
        container.innerHTML = `<div class="col-span-full p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-500 font-bold">مفيش اختبارات مضافة لسه. ارفع ملف اختبار أو جرّب الاختبار التجريبي!</div>`;
        return;
    }

    container.innerHTML = appState.tests.map(test => `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4">
            <div>
                <span class="text-xs font-extrabold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-300">${escapeHtml(test.subject)}</span>
                <h4 class="font-black text-base sm:text-lg mt-2">${escapeHtml(test.title)}</h4>
                <p class="text-xs text-slate-500 mt-1">${escapeHtml(test.book)} • ${test.questions.length} سؤال</p>
            </div>
            <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button onclick="startTestSolve('${test.id}')" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5">
                    <i class="ph-bold ph-play"></i> <span>${test.status === 'completed' ? 'إعادة الاختبار' : 'ابدأ الحل'}</span>
                </button>
                ${test.status === 'completed' ? `<button onclick="openTestResults('${test.id}')" class="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">النتيجة (${test.percentage}%)</button>` : ''}
                <button onclick="deleteTest('${test.id}')" class="p-2 text-rose-500 hover:bg-rose-50 rounded-xl" title="حذف"><i class="ph-bold ph-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function startTestSolve(testId) {
    currentTestId = testId;
    currentTestQuestionIndex = 0;
    localStorage.setItem(ACTIVE_TEST_KEY, testId);
    document.getElementById('tests-hub-view').classList.add('hidden');
    document.getElementById('test-solve-view').classList.remove('hidden');
    document.getElementById('test-results-view').classList.add('hidden');
    renderCurrentTestQuestion();
    renderTestMap();
}

function exitTestSolve() {
    document.getElementById('test-solve-view').classList.add('hidden');
    document.getElementById('tests-hub-view').classList.remove('hidden');
    renderTestsArchive();
}

function renderCurrentTestQuestion() {
    const test = appState.tests.find(t => t.id === currentTestId);
    if (!test) return;

    const q = test.questions[currentTestQuestionIndex];
    document.getElementById('test-solve-subject').textContent = test.subject;
    document.getElementById('test-solve-title').textContent = test.title;
    document.getElementById('test-solve-progress-text').textContent = `سؤال ${currentTestQuestionIndex + 1} من ${test.questions.length}`;
    document.getElementById('test-map-ratio').textContent = `${test.questions.filter(item => item.userAnswer !== null || item.essayScore !== null).length} / ${test.questions.length}`;

    document.getElementById('test-q-number-badge').textContent = `سؤال ${q.number}`;
    document.getElementById('test-q-type-badge').textContent = q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي';
    document.getElementById('test-q-text').textContent = q.questionText;

    const passageBox = document.getElementById('test-passage-box');
    const passageText = document.getElementById('test-passage-text');
    const activePassage = q.passage || test.passage;
    if (activePassage) {
        passageBox.classList.remove('hidden');
        passageText.textContent = activePassage;
    } else {
        passageBox.classList.add('hidden');
    }

    const imgWrap = document.getElementById('test-q-img-wrap');
    const imgEl = document.getElementById('test-q-img');
    if (q.questionImage) {
        imgEl.src = q.questionImage;
        imgWrap.classList.remove('hidden');
    } else {
        imgWrap.classList.add('hidden');
    }

    const mcqContainer = document.getElementById('test-options-container');
    const essayContainer = document.getElementById('test-essay-container');

    if (q.type === 'mcq') {
        mcqContainer.classList.remove('hidden');
        essayContainer.classList.add('hidden');
        const optionsKeys = Object.keys(q.options || { A: '', B: '', C: '', D: '' });
        mcqContainer.innerHTML = optionsKeys.map(key => {
            const isSelected = q.userAnswer === key;
            return `
                <button type="button" onclick="selectTestMcqOption('${key}')" class="w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-start ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-500'}">
                    <span class="w-10 h-10 rounded-full flex items-center justify-center font-black ${isSelected ? 'bg-white text-indigo-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'}">${key}</span>
                    <span class="font-bold text-sm sm:text-base flex-1">${escapeHtml(q.options[key])}</span>
                    ${isSelected ? '<i class="ph-fill ph-check-circle text-xl text-white"></i>' : ''}
                </button>
            `;
        }).join('');
    } else {
        mcqContainer.classList.add('hidden');
        essayContainer.classList.remove('hidden');
        document.getElementById('test-essay-input').value = q.userAnswer || '';
        document.getElementById('test-essay-model-wrap').classList.add('hidden');
    }

    document.getElementById('test-prev-btn').disabled = (currentTestQuestionIndex === 0);
    document.getElementById('test-next-btn').disabled = (currentTestQuestionIndex === test.questions.length - 1);
}

function selectTestMcqOption(key) {
    const test = appState.tests.find(t => t.id === currentTestId);
    if (!test) return;
    test.questions[currentTestQuestionIndex].userAnswer = key;
    persistState();
    renderCurrentTestQuestion();
    renderTestMap();
}

function saveTestEssayInput(val) {
    const test = appState.tests.find(t => t.id === currentTestId);
    if (!test) return;
    test.questions[currentTestQuestionIndex].userAnswer = val;
    persistState();
    renderTestMap();
}

function prevTestQuestion() {
    if (currentTestQuestionIndex > 0) {
        currentTestQuestionIndex--;
        renderCurrentTestQuestion();
        renderTestMap();
    }
}

function nextTestQuestion() {
    const test = appState.tests.find(t => t.id === currentTestId);
    if (test && currentTestQuestionIndex < test.questions.length - 1) {
        currentTestQuestionIndex++;
        renderCurrentTestQuestion();
        renderTestMap();
    }
}

function renderTestMap() {
    const test = appState.tests.find(t => t.id === currentTestId);
    if (!test) return;
    const grid = document.getElementById('test-map-grid');
    grid.innerHTML = test.questions.map((q, idx) => {
        const answered = q.userAnswer !== null && q.userAnswer !== '';
        const isCurrent = idx === currentTestQuestionIndex;
        return `
            <button type="button" onclick="currentTestQuestionIndex=${idx}; renderCurrentTestQuestion(); renderTestMap();" class="h-10 rounded-xl text-xs font-black transition-all ${isCurrent ? 'ring-2 ring-indigo-600 scale-105' : ''} ${answered ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}">
                ${q.number}
            </button>
        `;
    }).join('');
}

function initiateSubmitTest() {
    const test = appState.tests.find(t => t.id === currentTestId);
    if (!test) return;

    let earned = 0;
    let max = test.questions.length;

    test.questions.forEach(q => {
        if (q.type === 'mcq') {
            if (q.userAnswer === q.correctAnswer) {
                earned += 1;
                q.status = 'correct';
            } else {
                q.status = 'wrong';
            }
        } else {
            // essay
            earned += (q.essayScore || 0) / 2; // scale or points
            if (q.essayScore === 2) q.status = 'correct';
            else if (q.essayScore > 0) q.status = 'partial';
            else q.status = 'wrong';
        }
    });

    test.scoreEarned = earned;
    test.scoreMax = max;
    test.percentage = Math.round((earned / max) * 100);
    test.status = 'completed';
    persistState();

    openTestResults(test.id);
}

function openTestResults(testId) {
    currentTestId = testId;
    const test = appState.tests.find(t => t.id === testId);
    if (!test) return;

    document.getElementById('tests-hub-view').classList.add('hidden');
    document.getElementById('test-solve-view').classList.add('hidden');
    document.getElementById('test-results-view').classList.remove('hidden');

    document.getElementById('res-test-title').textContent = test.title;
    document.getElementById('res-score-fraction').textContent = `${test.scoreEarned} / ${test.scoreMax}`;
    document.getElementById('res-score-percent').textContent = `${test.percentage}%`;
    document.getElementById('res-correct-count').textContent = test.questions.filter(q => q.status === 'correct').length;
    document.getElementById('res-wrong-count').textContent = test.questions.filter(q => q.status === 'wrong').length;

    const list = document.getElementById('res-questions-review-list');
    list.innerHTML = test.questions.map((q, idx) => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border ${q.status === 'correct' ? 'border-emerald-300 bg-emerald-50/30' : 'border-rose-300 bg-rose-50/30'} space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-black text-sm">سؤال ${q.number}</span>
                <span class="px-2.5 py-1 rounded text-xs font-bold ${q.status === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${q.status === 'correct' ? 'صح ✅' : 'خطأ ❌'}</span>
            </div>
            <p class="font-bold text-sm">${escapeHtml(q.questionText)}</p>
            <div class="text-xs space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <p>إجابتك: <strong class="text-indigo-600">${escapeHtml(q.userAnswer || 'لم تجب')}</strong></p>
                <p>الإجابة النموذجية: <strong class="text-emerald-600">${escapeHtml(q.correctAnswer)}</strong></p>
                ${q.explanation ? `<p class="mt-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"><strong>التوضيح:</strong> ${escapeHtml(q.explanation)}</p>` : ''}
            </div>
        </div>
    `).join('');
}

function deleteTest(testId) {
    appState.tests = appState.tests.filter(t => t.id !== testId);
    persistState();
    renderTestsArchive();
    showToast('تم حذف الاختبار.', 'info');
}

// =========================================================================
// 6. DASHBOARD & MISTAKES HUB (STANDARD)
// =========================================================================
function getAllMistakes() {
    const list = [];
    appState.homeworks.forEach(hw => {
        if (hw.status === 'in_progress') return;
        hw.questions.forEach((q, qIdx) => {
            if (q.status === 'wrong') {
                list.push({ hwId: hw.id, qIdx, subject: hw.subject, book: hw.book, chapter: hw.chapter, lesson: hw.lesson, question: q });
            }
        });
    });
    return list;
}

function renderMistakesHub() {
    const allMistakes = getAllMistakes();
    const container = document.getElementById('mistakes-grouped-container');
    const badge = document.getElementById('mistakes-badge');
    if (badge) badge.textContent = allMistakes.length;
    if (!container) return;

    if (allMistakes.length === 0) {
        container.innerHTML = `<div class="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 font-bold">مفيش أي أخطاء مسجلة لسه! عاش يا بطل 🎉</div>`;
        return;
    }

    container.innerHTML = allMistakes.map(item => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
            <span class="text-xs font-bold text-blue-800">${escapeHtml(item.subject)} • ${escapeHtml(item.book)}</span>
            <h4 class="font-black text-sm">سؤال رقم ${item.question.number}</h4>
            <p class="text-xs text-slate-500">إجابتك: ${item.question.userAnswer} | الصحيحة: ${item.question.correctAnswer}</p>
        </div>
    `).join('');
}

function refreshAllUI() {
    updateGlobalStats();
    renderHomeArchive();
}

function updateGlobalStats() {
    const completed = appState.homeworks.filter(h => h.status !== 'in_progress');
    const elTotal = document.getElementById('stat-total-hw');
    const elAvg = document.getElementById('stat-avg-score');
    if (elTotal) elTotal.textContent = completed.length;
    if (elAvg) elAvg.textContent = (completed.length > 0 ? Math.round(completed.reduce((a, b) => a + b.percentage, 0) / completed.length) : 0) + '%';
}

function renderHomeArchive() {
    const container = document.getElementById('homeworks-archive-list');
    if (!container) return;
    if (appState.homeworks.length === 0) {
        container.innerHTML = `<div class="col-span-full p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 font-bold">مفيش واجبات محفوظة. ارفع ملف إجابات للبدء!</div>`;
        return;
    }
    container.innerHTML = appState.homeworks.map(hw => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
                <span class="text-xs font-bold text-blue-900">${escapeHtml(hw.subject)}</span>
                <h4 class="font-bold text-sm">${escapeHtml(hw.book)} - ${escapeHtml(hw.lesson)}</h4>
            </div>
            <button onclick="localStorage.setItem('${ACTIVE_HW_KEY}', '${hw.id}'); window.location.href='solve.html';" class="px-3 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold">فتح</button>
        </div>
    `).join('');
}

// =========================================================================
// 7. MODALS & TOASTS
// =========================================================================
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2 pointer-events-auto text-white ${type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`;
    toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', initApp);