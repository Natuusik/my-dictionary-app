// ========================================================
// 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И ЛОКАЛЬНОЙ АВТОРИЗАЦИИ
// ========================================================
// ========================================================
// 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И ОБЛАЧНОЙ БАЗЫ SUPABASE
// ========================================================

const SUPABASE_URL = 'https://pectfpuacdbkompcwyfm.supabase.co'; // Полная ссылка из твоей строки
const SUPABASE_KEY = 'sb_publishable_v4DIxL6UfhihcNOZkq-Bag_8OrXAF_D'; // Твой длинный ключ из второй строки

// Инициализируем официальный клиент Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ...весь остальной код Первой части, который мы собирали в прошлом сообщении...


let currentLanguage = 'en'; 
let activeTopicId = null;    
let availableVoices = [];    

let currentUser = localStorage.getItem('dictionary_logged_user') || null;
let appData = { en: [], et: [] };

const defaultAppData = {
    en: [
        {
            id: 1,
            name: "🔥 Глаголы",
            words: [
                { id: 101, foreign: "abilities", russian: "способности", customAudio: null },
                { id: 102, foreign: "environment", russian: "окружающая среда", customAudio: null }
            ]
        }
    ],
    et: []
};

// СУПЕР-СОХРАНЕНИЕ: Отправляет измененные слова напрямую в твою таблицу user_dictionaries
async function saveData() {
    if (!currentUser) return;
    
    try {
        const { error } = await supabase
            .from('user_dictionaries')
            .update({ appData: appData })
            .eq('username', currentUser);

        if (error) throw error;
        localStorage.setItem('my_dictionary_current_lang', currentLanguage);
    } catch (error) {
        console.error("Ошибка сохранения в облако Supabase:", error);
    }
}

// СУПЕР-ЗАГРУЗКА: Скачивает слова из таблицы user_dictionaries при входе
async function loadData() {
    if (!currentUser) return;

    try {
        const { data, error } = await supabase
            .from('user_dictionaries')
            .select('appData')
            .eq('username', currentUser)
            .single();

        if (error) throw error;
        
        // [ЗАЩИТА]: Если в облаке пусто или профиль новый, дарим стартовую структуру
        if (data && data.appData && (data.appData.en || data.appData.et)) {
            appData = data.appData;
        } else {
            appData = JSON.parse(JSON.stringify(defaultAppData));
            await saveData(); // Сразу прописываем структуру в облако
        }
    } catch (error) {
        console.error("Ошибка загрузки данных из Supabase, берем стандартные:", error);
        appData = JSON.parse(JSON.stringify(defaultAppData));
    }
}

// ФУНКЦИЯ 1: ЧИСТЫЙ ВХОД В ПРОФИЛЬ ЧЕРЕЗ ОБЛАКО
async function handleLoginOnly() {
    const userInput = document.getElementById('authUsername');
    const passInput = document.getElementById('authPassword');
    const errorBlock = document.getElementById('authError');
    
    if (!userInput || !passInput || !errorBlock) return;
    
    const username = userInput.value.trim().toLowerCase();
    const password = passInput.value.trim();
    
    if (!username || !password) {
        errorBlock.style.color = '#ef4444';
        errorBlock.innerText = "Введите и логин, и пароль!";
        return;
    }

    try {
        const { data, error } = await supabase
            .from('user_dictionaries')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !data) {
            errorBlock.style.color = '#ef4444';
            errorBlock.innerText = "Пользователь с таким логином не найден!";
            return;
        }

        if (data.password !== password) {
            errorBlock.style.color = '#ef4444';
            errorBlock.innerText = "Неверный пароль!";
            return;
        }

        currentUser = username;
        localStorage.setItem('dictionary_logged_user', currentUser);
        
        // [ЗАЩИТА]: Проверяем скачанные слова на пустоту
        if (data.appData && (data.appData.en || data.appData.et)) {
            appData = data.appData;
        } else {
            appData = JSON.parse(JSON.stringify(defaultAppData));
            // Мягко отправляем стартовую структуру, чтобы зафиксировать в базе
            await supabase.from('user_dictionaries').update({ appData: appData }).eq('username', currentUser);
        }
        
        const infoText = document.getElementById('userInfoText');
        if (infoText) infoText.innerText = `👤 Аккаунт: ${currentUser}`;
        
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainScreen').style.display = 'block';
        
        initApp();
    } catch (err) {
        errorBlock.style.color = '#ef4444';
        errorBlock.innerText = "Ошибка входа! Логин занят или база настраивается.";
    }
}

// ФУНКЦИЯ 2: ЧИСТАЯ РЕГИСТРАЦИЯ НОВОГО ПРОФИЛЯ В ОБЛАКЕ
async function handleRegisterOnly() {
    const userInput = document.getElementById('authUsername');
    const passInput = document.getElementById('authPassword');
    const errorBlock = document.getElementById('authError');
    
    if (!userInput || !passInput || !errorBlock) return;
    
    const username = userInput.value.trim().toLowerCase();
    const password = passInput.value.trim();
    
    if (!username || !password) {
        errorBlock.style.color = '#ef4444';
        errorBlock.innerText = "Заполните поля для создания аккаунта!";
        return;
    }

    if (password.length < 4) {
        errorBlock.style.color = '#ef4444';
        errorBlock.innerText = "Пароль должен быть не менее 4 символов!";
        return;
    }

    try {
        const { data: existingUser } = await supabase
            .from('user_dictionaries')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (existingUser) {
            errorBlock.style.color = '#ef4444';
            errorBlock.innerText = "Этот логин уже занят! Придумайте другой.";
            return;
        }

        // При регистрации сразу кладем чистую заготовку словаря
        const { error } = await supabase
            .from('user_dictionaries')
            .insert([{ 
                username: username, 
                password: password, 
                appData: { en: [], et: [] } 
            }]);

        if (error) throw error;

        errorBlock.style.color = '#10b981'; 
        errorBlock.innerText = `🎉 Аккаунт "${username}" создан! Теперь нажмите "Войти"`;
        passInput.value = '';
    } catch (err) {
        errorBlock.style.color = '#ef4444';
        errorBlock.innerText = "Не удалось зарегистрироваться в облаке.";
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('dictionary_logged_user');
    appData = { en: [], et: [] }; 
    activeTopicId = null;
    
    const contentBlock = document.getElementById('folderContentBlock');
    if (contentBlock) contentBlock.style.display = 'none';
    
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('mainScreen').style.display = 'none';
}

async function checkSession() {
    const savedLang = localStorage.getItem('my_dictionary_current_lang');
    if (savedLang) currentLanguage = savedLang;

    if (currentUser) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainScreen').style.display = 'block';
        
        const infoText = document.getElementById('userInfoText');
        if (infoText) infoText.innerText = `👤 Аккаунт: ${currentUser}`;
        
        await loadData(); 
        initApp();
    } else {
        document.getElementById('authScreen').style.display = 'block';
        document.getElementById('mainScreen').style.display = 'none';
    }
}

// ========================================================
// 2. УПРАВЛЕНИЕ ЯЗЫКАМИ И ПАПКАМИ (ТЕМAМИ)
// ========================================================

function switchLanguage(lang) {
    currentLanguage = lang;
    activeTopicId = null; 
    
    const tabEn = document.getElementById('tab-en');
    const tabEt = document.getElementById('tab-et');
    if (tabEn) tabEn.classList.toggle('active', lang === 'en');
    if (tabEt) tabEt.classList.toggle('active', lang === 'et');
    
    // Прячем только блок со словами темы, так как тема ещё не выбрана
    const contentBlock = document.getElementById('folderContentBlock');
    if (contentBlock) contentBlock.style.display = 'none';
    
    saveData();     
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

function createTopic() {
    const input = document.getElementById('newTopicInput');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) { alert("Введи название папки!"); return; }

    const newTopic = { id: Date.now(), name: name, words: [] };
    if (!appData[currentLanguage]) appData[currentLanguage] = [];
    
    appData[currentLanguage].push(newTopic);
    input.value = ''; 
    
    saveData();     
    renderTopics(); 
}

function deleteTopic(id) {
    if (!confirm("Удалить эту папку и все слова внутри неё?")) return;
    appData[currentLanguage] = appData[currentLanguage].filter(t => t.id !== id);
    
    if (activeTopicId === id) {
        activeTopicId = null;
        const contentBlock = document.getElementById('folderContentBlock');
        if (contentBlock) contentBlock.style.display = 'none';
    }
    saveData(); 
    renderTopics();
}

function renameActiveTopic() {
    const currentTopics = appData[currentLanguage] || [];
    const topic = currentTopics.find(t => t.id === activeTopicId);
    if (!topic) return;

    const newName = prompt("Введи новое название для этой папки:", topic.name);
    if (newName && newName.trim() !== "") {
        topic.name = newName.trim();
        const activeFolderNameElem = document.getElementById('activeFolderName');
        if (activeFolderNameElem) activeFolderNameElem.innerText = topic.name;
        saveData(); 
        renderTopics(); 
    }
}
// ========================================================
// 3. РАБОТА СО СЛОВАМИ И ЗАПИСЬ ГОЛОСА (BASE64)
// ========================================================

function openTopic(id) {
    activeTopicId = id;
    const topic = appData[currentLanguage].find(t => t.id === id);
    if (!topic) return;

    const activeFolderNameElem = document.getElementById('activeFolderName');
    const contentBlock = document.getElementById('folderContentBlock');
    
    if (activeFolderNameElem) activeFolderNameElem.innerText = topic.name;
    if (contentBlock) contentBlock.style.display = 'block';
    
    renderTopics(); 
    renderWords();  
}

function renderWords() {
    const container = document.getElementById('wordsContainer');
    if (!container) return;
    container.innerHTML = '';

    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (!topic || topic.words.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-size:14px; padding:10px 0;">В этой папке пока пусто. Добавь слова ниже!</p>';
        return;
    }

    topic.words.forEach(w => {
        const item = document.createElement('div');
        item.className = 'word-item';
        
        // Кнопка меняет текст в зависимости от наличия записи
        const hasVoice = w.customAudio ? '🔊 Послушать' : '🎙 Записать';
        
        // [НОВОЕ]: Если запись есть, выводим дополнительную кнопку перезаписи 🔄
        const retryButton = w.customAudio ? `<button class="btn-mic" style="background: #e2e8f0; color: #475569; margin-right: 5px;" onclick="resetVoice(${w.id})">🔄 Перезаписать</button>` : '';

        item.innerHTML = `
            <div style="text-align: left;">
                <strong>${w.foreign}</strong> — <span style="color:#64748b;">${w.russian}</span>
            </div>
            <div class="word-actions">
                ${retryButton}
                <button class="btn-mic" id="mic-btn-${w.id}" onclick="handleVoiceAction(${w.id})">${hasVoice}</button>
                <button class="btn-delete-word" onclick="deleteWord(${w.id})">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });
}

function addWordToTopic() {
    const foreignInput = document.getElementById('foreignWordInput');
    const russianInput = document.getElementById('russianWordInput');
    if (!foreignInput || !russianInput) return;
    
    const foreignText = foreignInput.value.trim();
    const russianText = russianInput.value.trim();

    if (!foreignText || !russianText) {
        alert("Заполни оба поля!");
        return;
    }

    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (topic) {
        topic.words.push({
            id: Date.now(),
            foreign: foreignText,
            russian: russianText,
            customAudio: null
        });

        foreignInput.value = '';
        russianInput.value = '';
        
        saveData(); 
        renderWords(); 
    }
}

function deleteWord(wordId) {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (topic) {
        topic.words = topic.words.filter(w => w.id !== wordId);
        saveData(); 
        renderWords();
    }
}

// [НОВОЕ]: Функция сброса аудио для возможности перезаписи
function resetVoice(wordId) {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    const word = topic ? topic.words.find(w => w.id === wordId) : null;
    if (word) {
        word.customAudio = null; // Стираем старый звук
        saveData();
        renderWords(); // Перерисовываем список, чтобы кнопка снова стала "🎙 Записать"
    }
}

function handleVoiceAction(wordId) {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    const word = topic ? topic.words.find(w => w.id === wordId) : null;
    
    if (word && word.customAudio) {
        const btn = document.getElementById(`mic-btn-${wordId}`);
        if (btn) {
            btn.innerText = "🎵 Воспроизведение...";
            btn.style.background = "#3b82f6"; // Меняет цвет на синий во время проигрывания
        }

        const audio = new Audio(word.customAudio);
        audio.play();

        // [ИСПРАВЛЕНО]: Как только аудиофайл доиграл до конца, кнопка САМА возвращается в норму
        audio.onended = function() {
            if (btn) {
                btn.innerText = "🔊 Послушать";
                btn.style.background = ""; // Возвращаем стандартный цвет из CSS
            }
        };
    } else {
        toggleRecord(wordId);
    }
}

// Студийная запись голоса с шумоподавлением и эхоподавлением
async function toggleRecord(wordId) {
    const btn = document.getElementById(`mic-btn-${wordId}`);
    if (!btn) return;
    
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        recordingWordId = wordId;
        audioChunks = [];
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 44100
                } 
            });
            
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = function() {
                    const base64Audio = reader.result;
                    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
                    const word = topic ? topic.words.find(w => w.id === recordingWordId) : null;
                    
                    if (word) {
                        word.customAudio = base64Audio; 
                        saveData();                    
                        renderWords();                 
                    }
                };
            };
            
            mediaRecorder.start();
            btn.innerText = "🛑 Стоп";
            btn.style.background = "#ef4444";
        } catch (err) {
            console.error("Не удалось получить доступ к микрофону:", err);
            alert("Ошибка: Проверь, разрешён ли микрофон в замочке сайта!");
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}


// ========================================================
// 4. ПОДГОТОВКА РОБОТОВ ОЗВУЧКИ И ПАМЯТЬ НАСТРОЕК
// ========================================================

function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;

    availableVoices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voiceSelectNew'); 
    if (!voiceSelect) return;

    voiceSelect.innerHTML = '';

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
    const voiceSelect = document.getElementById('voiceSelectNew');

    const savedSpeed = localStorage.getItem('trainer_saved_speed');
    const savedPause = localStorage.getItem('trainer_saved_pause');
    const savedMode = localStorage.getItem('trainer_saved_mode');
    const savedVoice = localStorage.getItem('trainer_saved_voice');

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
    if (savedVoice && voiceSelect && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
        voiceSelect.value = savedVoice;
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
// 4.1. ЛОГИКА ТРЕНАЖЁРА И ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
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
        firstSpeechLang = currentLanguage === 'en' ? 'en-US' : 'et-EE'; 
        secondSpeechText = randomWord.russian;
        secondSpeechLang = 'ru-RU';
        if (randomWord.customAudio) isCustomAudioForFirstStep = true;
    } else {
        firstSpeechText = randomWord.russian;
        firstSpeechLang = 'ru-RU';
        secondSpeechText = randomWord.foreign;
        secondSpeechLang = currentLanguage === 'en' ? 'en-US' : 'et-EE';
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
            if (val === 'fake-et') { forceLangFirst = 'et-EE'; forceLangSecond = 'et-EE'; }
        } else if (availableVoices.length > 0) {
            selectedVoice = availableVoices[parseInt(val)];
        }
    }

    // Умное разделение: Эстонский через ИИ Mari, остальные — через Премиум-голоса системы
    function speakWithRobot(text, targetLang) {
        if (audioTypeDisplay) audioTypeDisplay.innerText = "🤖 Умная озвучка";

        if (targetLang.startsWith('et')) {
            const ekiUrl = `https://eki.ee{encodeURIComponent(text)}`;
            const audio = new Audio(ekiUrl);
            audio.playbackRate = currentSpeed;
            audio.play().catch(() => {
                fallbackSpeech(text, 'et-EE');
            });
            return;
        }

        fallbackSpeech(text, targetLang);
    }

    // [ОБНОВЛЕНО]: Алгоритм поиска Сверхреалистичных (Natural/Premium) голосов в системе устройства
    function fallbackSpeech(text, targetLang) {
        if (typeof speechSynthesis === 'undefined') return;
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = currentSpeed;

        const allVoices = window.speechSynthesis.getVoices();
        const shortLang = targetLang.substring(0, 2).toLowerCase();

        // Пошаговый поиск лучшего голоса:
        // 1. Ищем современные "Natural" или "Premium" ИИ-голоса от Microsoft/Google/Apple
        let bestVoice = allVoices.find(v => v.lang.toLowerCase().startsWith(shortLang) && (v.name.includes('Natural') || v.name.includes('Premium')));
        
        // 2. Если нет, ищем качественные голоса от Google
        if (!bestVoice) bestVoice = allVoices.find(v => v.lang.toLowerCase().startsWith(shortLang) && v.name.includes('Google'));
        
        // 3. Если нет, ищем стандартный голос Microsoft (например, Ирина) или Apple (Милена)
        if (!bestVoice) bestVoice = allVoices.find(v => v.lang.toLowerCase().startsWith(shortLang) && (v.name.includes('Irina') || v.name.includes('Milena')));
        
        // 4. Откатываемся на любой доступный для этого языка
        if (!bestVoice) bestVoice = allVoices.find(v => v.lang.toLowerCase().startsWith(shortLang));

        if (bestVoice) {
            utterance.voice = bestVoice;
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
            document.getElementById('timerDisplay').innerText = `Вспомни перевод... (${secondsLeft} сек)`;
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
}

checkSession();
