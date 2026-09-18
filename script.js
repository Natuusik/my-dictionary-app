// ========================================================
// 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И СЕРВЕРНОЙ АВТОРИЗАЦИИ
// ========================================================

let currentLanguage = 'en'; 
let activeTopicId = null;    
let availableVoices = [];    

// Глобальная переменная для хранения имени вошедшего пользователя
let currentUser = localStorage.getItem('dictionary_logged_user') || null;
let appData = { en: [], et: [] };

// ФУНКЦИЯ СОХРАНЕНИЯ: Отправляет изменения на сервер конкретному пользователю
async function saveData() {
    if (!currentUser) return;
    
    try {
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser,
                appData: appData
            })
        });
        localStorage.setItem('my_dictionary_current_lang', currentLanguage);
    } catch (error) {
        console.error("Ошибка отправки данных на сервер:", error);
    }
}

// ФУНКЦИЯ ВХОДА И РЕГИСТРАЦИИ
async function handleAuth() {
    const userInput = document.getElementById('authUsername');
    const passInput = document.getElementById('authPassword');
    const errorBlock = document.getElementById('authError');
    
    if (!userInput || !passInput) return;
    
    const username = userInput.value.trim();
    const password = passInput.value.trim();
    
    if (!username || !password) {
        if (errorBlock) errorBlock.innerText = "Заполните все поля!";
        return;
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Запоминаем пользователя в браузере
            currentUser = result.user;
            localStorage.setItem('dictionary_logged_user', currentUser);
            appData = result.appData;
            
            // Прячем окно входа, открываем сайт
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('mainScreen').style.display = 'block';
            
            // Запускаем отрисовку
            initApp();
        } else {
            if (errorBlock) errorBlock.innerText = result.error || "Ошибка авторизации";
        }
    } catch (err) {
        if (errorBlock) errorBlock.innerText = "Сервер недоступен. Запустите бэкенд!";
    }
}

// Проверка сессии при загрузке страницы
function checkSession() {
    const savedLang = localStorage.getItem('my_dictionary_current_lang');
    if (savedLang) currentLanguage = savedLang;

    // Если пользователь уже входил ранее на этом устройстве, мы не запрашиваем пароль заново
    if (currentUser) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainScreen').style.display = 'block';
        
        // Быстро запрашиваем у сервера актуальные слова
        fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, password: "" }) 
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) appData = result.appData;
            initApp();
        })
        .catch(() => {
            // Если локальный сервер пока не запущен, берем пустую структуру
            initApp();
        });
    } else {
        // Если пользователя нет — показываем окно входа
        document.getElementById('authScreen').style.display = 'block';
        document.getElementById('mainScreen').style.display = 'none';
    }
}

let mediaRecorder = null;
let audioChunks = [];
let recordingWordId = null;
let wordTimeout = null;
let countdownInterval = null;
let isTraining = false;

// ========================================================
// ФУНКЦИЯ 1: СТРОГО ВХОД В СУЩЕСТВУЮЩИЙ АККАУНТ
async function handleLoginOnly() {
    const userInput = document.getElementById('authUsername');
    const passInput = document.getElementById('authPassword');
    const errorBlock = document.getElementById('authError');
    
    if (!userInput || !passInput) return;
    
    const username = userInput.value.trim();
    const password = passInput.value.trim();
    
    if (!username || !password) {
        if (errorBlock) errorBlock.style.color = '#ef4444';
        if (errorBlock) errorBlock.innerText = "Введите и логин, и пароль!";
        return;
    }

    try {
        // Мы отправляем запрос на роут авторизации /api/auth (или /api/auth/login в зависимости от бэкенда)
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            currentUser = result.user;
            localStorage.setItem('dictionary_logged_user', currentUser);
            appData = result.appData;
            
            const infoText = document.getElementById('userInfoText');
            if (infoText) infoText.innerText = `👤 Аккаунт: ${currentUser}`;
            
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('mainScreen').style.display = 'block';
            
            initApp();
        } else {
            if (errorBlock) errorBlock.style.color = '#ef4444';
            if (errorBlock) errorBlock.innerText = result.error || "Логин не найден или пароль неверен!";
        }
    } catch (err) {
        if (errorBlock) errorBlock.style.color = '#ef4444';
        if (errorBlock) errorBlock.innerText = "Сервер бэкенда недоступен!";
    }
}

// ФУНКЦИЯ 2: СТРОГО РЕГИСТРАЦИЯ НОВОГО АККАУНТА
async function handleRegisterOnly() {
    const userInput = document.getElementById('authUsername');
    const passInput = document.getElementById('authPassword');
    const errorBlock = document.getElementById('authError');
    
    if (!userInput || !passInput) return;
    
    const username = userInput.value.trim();
    const password = passInput.value.trim();
    
    if (!username || !password) {
        if (errorBlock) errorBlock.style.color = '#ef4444';
        if (errorBlock) errorBlock.innerText = "Заполните поля для создания аккаунта!";
        return;
    }

    // Если пароль слишком короткий, предупреждаем пользователя
    if (password.length < 4) {
        if (errorBlock) errorBlock.style.color = '#ef4444';
        if (errorBlock) errorBlock.innerText = "Пароль должен быть не менее 4 символов!";
        return;
    }

    try {
        // Если мы переписали сервер под раздельный роут, шлём на /api/auth/register, 
        // Если сервер старый (из users_db.json), он сам поймет, что это новый юзер при отправке данных
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Проверяем, создал ли сервер новый профиль или просто зашёл в старый
            if (result.message && result.message.includes('Новый аккаунт')) {
                if (errorBlock) errorBlock.style.color = '#10b981'; // зелёный цвет успеха
                if (errorBlock) errorBlock.innerText = `🎉 Аккаунт "${username.toLowerCase()}" успешно создан! Нажмите кнопку "Войти"`;
                
                // Очищаем поле пароля, чтобы пользователь ввёл его осознанно для входа
                passInput.value = '';
            } else {
                // Если аккаунт уже существовал в старой базе данных
                if (errorBlock) errorBlock.style.color = '#ef4444';
                if (errorBlock) errorBlock.innerText = "Этот логин уже занят! Придумайте другой.";
            }
        } else {
            if (errorBlock) errorBlock.style.color = '#ef4444';
            if (errorBlock) errorBlock.innerText = result.error || "Не удалось создать аккаунт";
        }
    } catch (err) {
        if (errorBlock) errorBlock.style.color = '#ef4444';
        if (errorBlock) errorBlock.innerText = "Сервер недоступен!";
    }
}

// ========================================================
// 3. УПРАВЛЕНИЕ ЯЗЫКАМИ И ПАПКАМИ (ТЕМAМИ)
// ========================================================

async function switchLanguage(lang) {
    currentLanguage = lang;
    activeTopicId = null; 
    
    const tabEn = document.getElementById('tab-en');
    const tabEt = document.getElementById('tab-et');
    if (tabEn) tabEn.classList.toggle('active', lang === 'en');
    if (tabEt) tabEt.classList.toggle('active', lang === 'et');
    
    const contentBlock = document.getElementById('folderContentBlock');
    if (contentBlock) contentBlock.style.display = 'none';
    
    await saveData();     
    renderTopics(); 
}

function renderTopics() {
    const container = document.getElementById('topicsContainer');
    if (!container) return;
    container.innerHTML = '';

    const currentTopics = appData[currentLanguage] || [];

    if (currentTopics.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-size:14px; grid-column:span 3;">Папок пока нет. Создай первую тему выше!</p>';
        return;
    }

    currentTopics.forEach(topic => {
        const folder = document.createElement('div');
        folder.className = `topic-folder ${activeTopicId === topic.id ? 'active' : ''}`;
        
        folder.onclick = (e) => {
            if (e.target.classList.contains('btn-delete-folder')) return;
            openTopic(topic.id);
        };

        folder.innerHTML = `
            <button class="btn-delete-folder" onclick="deleteTopic(${topic.id})">❌</button>
            <span class="folder-icon">📁</span>
            <span class="folder-name">${topic.name}</span>
        `;
        container.appendChild(folder);
    });
}

async function createTopic() {
    const input = document.getElementById('newTopicInput');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) { alert("Введи название папки!"); return; }

    const newTopic = { id: Date.now(), name: name, words: [] };
    if (!appData[currentLanguage]) appData[currentLanguage] = [];
    
    appData[currentLanguage].push(newTopic);
    input.value = ''; 
    
    await saveData();     
    renderTopics(); 
}

async function deleteTopic(id) {
    if (!confirm("Удалить эту папку и все слова внутри неё?")) return;
    appData[currentLanguage] = appData[currentLanguage].filter(t => t.id !== id);
    
    if (activeTopicId === id) {
        activeTopicId = null;
        const contentBlock = document.getElementById('folderContentBlock');
        if (contentBlock) contentBlock.style.display = 'none';
    }
    await saveData(); 
    renderTopics();
}

async function renameActiveTopic() {
    const currentTopics = appData[currentLanguage] || [];
    const topic = currentTopics.find(t => t.id === activeTopicId);
    if (!topic) return;

    const newName = prompt("Введи новое название для этой папки:", topic.name);
    if (newName && newName.trim() !== "") {
        topic.name = newName.trim();
        const activeFolderNameElem = document.getElementById('activeFolderName');
        if (activeFolderNameElem) activeFolderNameElem.innerText = topic.name;
        await saveData(); 
        renderTopics(); 
    }
}
// ========================================================
// 4.1. ПОДГОТОВКА РОБОТОВ ОЗВУЧКИ И ПАМЯТЬ НАСТРОЕК
// ========================================================

function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;

    availableVoices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voiceSelectNew'); 
    if (!voiceSelect) return;

    voiceSelect.innerHTML = '';

    // Вариант А: Если браузер честно отдал системные голоса
    if (availableVoices.length > 0) {
        const filteredVoices = availableVoices.filter(voice => {
            const lang = voice.lang.toLowerCase();
            return lang.startsWith('en') || lang.startsWith('et') || lang.startsWith('ru') || lang.startsWith('fi');
        });

        const voicesToDisplay = filteredVoices.length > 0 ? filteredVoices : availableVoices;

        voicesToDisplay.forEach((voice) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = availableVoices.indexOf(voice); 
            voiceSelect.appendChild(option);
        });

        const savedVoice = localStorage.getItem('trainer_saved_voice');
        if (savedVoice && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
            voiceSelect.value = savedVoice;
        } else {
            const ruIdx = availableVoices.findIndex(v => v.lang.startsWith('ru-RU') || v.lang.startsWith('ru_RU'));
            if (ruIdx !== -1) voiceSelect.value = ruIdx;
        }
        return; 
    }

    // Вариант Б: Резервный список, если браузер заблокировал загрузку локально
    const fakeVoices = [
        { name: "🇷🇺 Робот Ирина (Стандартный русский)", lang: "ru-RU", id: "fake-ru" },
        { name: "🇬🇧 Робот Джон (Стандартный английский)", lang: "en-US", id: "fake-en" },
        { name: "🇪🇪 Робот Март (Улучшенный эстонский/финский)", lang: "fi-FI", id: "fake-et" }
    ];

    fakeVoices.forEach(fake => {
        const option = document.createElement('option');
        option.textContent = fake.name;
        option.value = fake.id; 
        voiceSelect.appendChild(option);
    });

    const savedVoice = localStorage.getItem('trainer_saved_voice');
    if (savedVoice && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
        voiceSelect.value = savedVoice;
    } else {
        voiceSelect.value = "fake-ru";
    }
}

// Запускаем непрерывный опрос системы до полной готовности голосов
let voiceCheckInterval = setInterval(() => {
    if (typeof speechSynthesis !== 'undefined') {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            populateVoiceList();
            clearInterval(voiceCheckInterval);
        }
    }
}, 300);

if (typeof speechSynthesis !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
        populateVoiceList();
        clearInterval(voiceCheckInterval);
    };
}
setTimeout(populateVoiceList, 500);

function saveTrainerSettings() {
    const speedInput = document.getElementById('speedRangeNew');
    const pauseInput = document.getElementById('pauseRangeNew');
    const modeSelect = document.getElementById('modeSelectNew');
    const voiceSelect = document.getElementById('voiceSelectNew');

    if (speedInput) localStorage.setItem('trainer_saved_speed', speedInput.value);
    if (pauseInput) localStorage.setItem('trainer_saved_pause', pauseInput.value);
    if (modeSelect) localStorage.setItem('trainer_saved_mode', modeSelect.value);
    if (voiceSelect) localStorage.setItem('trainer_saved_voice', voiceSelect.value);
}

function loadTrainerSettings() {
    const speedInput = document.getElementById('speedRangeNew');
    const pauseInput = document.getElementById('pauseRangeNew');
    const modeSelect = document.getElementById('modeSelectNew');

    const savedSpeed = localStorage.getItem('trainer_saved_speed');
    const savedPause = localStorage.getItem('trainer_saved_pause');
    const savedMode = localStorage.getItem('trainer_saved_mode');

    if (savedSpeed && speedInput) {
        speedInput.value = savedSpeed;
        const valElem = document.getElementById('speedValue');
        if (valElem) valElem.innerText = savedSpeed;
    }
    if (savedPause && pauseInput) {
        pauseInput.value = savedPause;
        const valElem = document.getElementById('pauseValue');
        if (valElem) valElem.innerText = savedPause;
    }
    if (savedMode && modeSelect) {
        modeSelect.value = savedMode;
    }
}

document.addEventListener("change", (e) => {
    if (e.target && (e.target.id === 'speedRangeNew' || e.target.id === 'pauseRangeNew' || e.target.id === 'modeSelectNew' || e.target.id === 'voiceSelectNew')) {
        saveTrainerSettings();
    }
});
document.addEventListener("input", (e) => {
    if (e.target && e.target.id === 'speedRangeNew') {
        saveTrainerSettings(); 
    }
});
// ========================================================
// 4.2. ЛОГИКА ТРЕНАЖЁРА И ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ========================================================

function toggleTraining() {
    if (isTraining) {
        stopTraining();
    } else {
        startTraining();
    }
}

function startTraining() {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    
    if (!topic || topic.words.length === 0) {
        alert("В этой папке нет слов для тренировки! Сначала добавь слова.");
        return;
    }

    isTraining = true;
    saveTrainerSettings(); 
    
    const mainScreen = document.getElementById('mainScreen');
    const trainerScreen = document.getElementById('trainerScreen');
    if (mainScreen) mainScreen.style.display = 'none';
    if (trainerScreen) trainerScreen.style.display = 'block';

    if (document.getElementById('wordDisplay')) document.getElementById('wordDisplay').innerText = "Приготовься...";
    if (document.getElementById('translationDisplay')) document.getElementById('translationDisplay').innerText = "";
    if (document.getElementById('audioTypeDisplay')) document.getElementById('audioTypeDisplay').innerText = "";

    nextTrainingStep(); 
}

function stopTraining() {
    isTraining = false;
    clearTimeout(wordTimeout);
    clearInterval(countdownInterval);
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    const mainScreen = document.getElementById('mainScreen');
    const trainerScreen = document.getElementById('trainerScreen');
    if (mainScreen) mainScreen.style.display = 'block';
    if (trainerScreen) trainerScreen.style.display = 'none';
}

function nextTrainingStep() {
    if (!isTraining) return;

    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (!topic || topic.words.length === 0) { stopTraining(); return; }

    const randomIndex = Math.floor(Math.random() * topic.words.length);
    const randomWord = topic.words[randomIndex];

    const wordDisplay = document.getElementById('wordDisplay');
    const translationDisplay = document.getElementById('translationDisplay');
    const audioTypeDisplay = document.getElementById('audioTypeDisplay');
    const timerDisplay = document.getElementById('timerDisplay');

    const speedInput = document.getElementById('speedRangeNew');
    const pauseInput = document.getElementById('pauseRangeNew');
    const modeSelect = document.getElementById('modeSelectNew');
    const voiceSelect = document.getElementById('voiceSelectNew');
    
    const currentSpeed = speedInput ? parseFloat(speedInput.value) : 1.0;
    const userPauseSeconds = pauseInput ? parseInt(pauseInput.value) : 3;
    const currentMode = modeSelect ? modeSelect.value : 'foreign-ru';

    if (translationDisplay) translationDisplay.innerText = "";

    let firstSpeechText = "";
    let firstSpeechLang = "";
    let secondSpeechText = "";
    let secondSpeechLang = "";
    let isCustomAudioForFirstStep = false;
    let isCustomAudioForSecondStep = false;

    if (currentMode === 'foreign-ru') {
        firstSpeechText = randomWord.foreign;
        firstSpeechLang = currentLanguage === 'en' ? 'en-US' : 'fi-FI'; 
        secondSpeechText = randomWord.russian;
        secondSpeechLang = 'ru-RU';
        if (randomWord.customAudio) isCustomAudioForFirstStep = true;
    } else {
        firstSpeechText = randomWord.russian;
        firstSpeechLang = 'ru-RU';
        secondSpeechText = randomWord.foreign;
        secondSpeechLang = currentLanguage === 'en' ? 'en-US' : 'fi-FI';
        if (randomWord.customAudio) isCustomAudioForSecondStep = true;
    }

    if (wordDisplay) wordDisplay.innerText = firstSpeechText;

    let selectedVoice = null;
    let forceLangFirst = firstSpeechLang;
    let forceLangSecond = secondSpeechLang;

    if (voiceSelect && voiceSelect.value !== 'default') {
        const val = voiceSelect.value;
        if (val.startsWith('fake-')) {
            if (val === 'fake-ru') { forceLangFirst = 'ru-RU'; forceLangSecond = 'ru-RU'; }
            if (val === 'fake-en') { forceLangFirst = 'en-US'; forceLangSecond = 'en-US'; }
            if (val === 'fake-et') { forceLangFirst = 'fi-FI'; forceLangSecond = 'fi-FI'; }
        } else if (availableVoices.length > 0) {
            selectedVoice = availableVoices[parseInt(val)];
        }
    }

    function speakWithRobot(text, targetLang) {
        if (audioTypeDisplay) audioTypeDisplay.innerText = "🤖 Озвучка роботом";
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = currentSpeed;
        
        if (selectedVoice && !voiceSelect.value.startsWith('fake-') && selectedVoice.lang.toLowerCase().startsWith(targetLang.substring(0, 2))) {
            utterance.voice = selectedVoice;
        } else {
            utterance.lang = targetLang;
        }
        window.speechSynthesis.speak(utterance);
    }

    if (isCustomAudioForFirstStep && randomWord.customAudio) {
        if (audioTypeDisplay) audioTypeDisplay.innerText = "🎤 Звучит твой голос";
        const audio = new Audio(randomWord.customAudio);
        audio.playbackRate = currentSpeed;
        audio.play();
    } else {
        speakWithRobot(firstSpeechText, forceLangFirst);
    }

    let secondsLeft = userPauseSeconds;
    if (timerDisplay) timerDisplay.innerText = `Вспомни перевод... (${secondsLeft} сек)`;

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0 && timerDisplay) {
            timerDisplay.innerText = `Вспомни перевод... (${secondsLeft} сек)`;
        } else {
            clearInterval(countdownInterval);
        }
    }, 1000);

    clearTimeout(wordTimeout);
    wordTimeout = setTimeout(() => {
        if (!isTraining) return;

        if (translationDisplay) translationDisplay.innerText = secondSpeechText;
        if (timerDisplay) timerDisplay.innerText = "Правильно!";

        if (isCustomAudioForSecondStep && randomWord.customAudio) {
            if (audioTypeDisplay) audioTypeDisplay.innerText = "🎤 Звучит твой голос";
            const audio = new Audio(randomWord.customAudio);
            audio.playbackRate = currentSpeed;
            audio.play();
        } else {
            speakWithRobot(secondSpeechText, forceLangSecond);
        }

        wordTimeout = setTimeout(() => {
            if (isTraining) nextTrainingStep();
        }, 2500);

    }, userPauseSeconds * 1000);
}

function handleSmartOfflineInput(text) {}

function initApp() {
    loadData();
    loadTrainerSettings(); 
    switchLanguage(currentLanguage);
    
    if (currentUser) {
        const infoText = document.getElementById('userInfoText');
        if (infoText) infoText.innerText = `👤 Аккаунт: ${currentUser}`;
    }
}

// ПРОВЕРКА СЕССИИ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ


// Автозапуск
initApp();
checkSession();