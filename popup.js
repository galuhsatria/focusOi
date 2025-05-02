let timer;
let isRunning = false;
let currentTime = 1500;
let mode = 'pomodoro';
let selectedAudio;
let backgroundAudioPlaying = false;

const timeDisplay = document.getElementById('time');
const startButton = document.getElementById('start');
const pomodoroBtn = document.getElementById('pomodoro');
const shortBreakBtn = document.getElementById('shortbreak');
const longBreakBtn = document.getElementById('longbreak');

const audioOptions = [
  { id: '1', label: 'Notif 1', src: './sounds/notif1.mp3' },
  { id: '2', label: 'Notif 2', src: './sounds/notif2.mp3' },
  { id: '3', label: 'Notif 3', src: './sounds/notif3.mp3' },
];

const audioElements = {};
const notifContainer = document.querySelector('.notification-choices');

// Cek apakah ekstensi berjalan sebagai popup atau background
const isBackgroundPage = chrome.extension.getBackgroundPage() === window;

// Setup audio player untuk setiap opsi suara
audioOptions.forEach((option) => {
  const div = document.createElement('div');
  div.className = 'notification-sound';
  div.id = option.id;
  div.innerHTML = `<p>${option.label}</p>`;
  notifContainer.appendChild(div);

  const audio = new Audio(option.src);
  audioElements[option.id] = audio;

  div.addEventListener('click', () => {
    if (selectedAudio === audio && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      selectedAudio = null;
      div.classList.remove('active');
      saveSettings();
      return;
    }

    Object.values(audioElements).forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });

    audio.play();
    selectedAudio = audio;

    document.querySelectorAll('.notification-sound').forEach((el) => el.classList.remove('active'));
    div.classList.add('active');

    saveSettings();
  });
});

// Format waktu untuk display
function formatTime(seconds) {
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

// Update tampilan timer
function updateDisplay() {
  if (timeDisplay) {
    timeDisplay.textContent = formatTime(currentTime);
  }
  // Update judul halaman untuk menampilkan waktu tersisa
  document.title = `${formatTime(currentTime)} - FocusOi`;

  // Update badge ekstensi untuk menampilkan menit yang tersisa
  if (chrome.browserAction) {
    const minutes = Math.ceil(currentTime / 60);
    chrome.browserAction.setBadgeText({ text: minutes.toString() });

    // Warna badge sesuai mode
    const badgeColor = mode === 'pomodoro' ? '#d95550' : mode === 'shortbreak' ? '#4c9195' : '#457ca3';
    chrome.browserAction.setBadgeBackgroundColor({ color: badgeColor });
  }
}

// Set mode timer (pomodoro, shortbreak, longbreak)
function setMode(newMode) {
  // Kirim pesan ke background script untuk mengubah mode
  chrome.runtime.sendMessage(
    {
      action: 'setMode',
      mode: newMode,
    },
    (response) => {
      if (response) {
        mode = response.mode;
        currentTime = response.currentTime;
        isRunning = response.isRunning;

        if (document.querySelector('body')) {
          document.querySelector('body').className = mode;
        }

        const buttons = [pomodoroBtn, shortBreakBtn, longBreakBtn].filter((btn) => btn);
        buttons.forEach((btn) => btn.classList.remove('active'));

        if (mode === 'pomodoro' && pomodoroBtn) pomodoroBtn.classList.add('active');
        if (mode === 'shortbreak' && shortBreakBtn) shortBreakBtn.classList.add('active');
        if (mode === 'longbreak' && longBreakBtn) longBreakBtn.classList.add('active');

        updateDisplay();
        if (startButton) {
          startButton.querySelector('span').textContent = isRunning ? 'Pause' : 'Mulai';
        }
      }
    }
  );
}

// Mengelola timer
function toggleTimer() {
  // Kirim pesan ke background script untuk toggle timer
  chrome.runtime.sendMessage({ action: 'toggleTimer' }, (response) => {
    if (response && response.isRunning !== undefined) {
      isRunning = response.isRunning;

      if (startButton) {
        startButton.querySelector('span').textContent = isRunning ? 'Pause' : 'Mulai';
        startButton.querySelector('.svg-wrapper').innerHTML = isRunning
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`
          : `<svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="lucide lucide-play-icon lucide-play"
                >
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>`;
      }
    }
  });
}

// Membuat notifikasi desktop
function createNotification() {
  const title = 'Waktu habis! 🚨';
  const message = `Sesi ${mode} selesai.`;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png', // Pastikan Anda memiliki file icon ini
    title: title,
    message: message,
    priority: 2,
  });
}

// Memutar suara notifikasi termasuk di background
function playNotificationSound() {
  const settings = getSettings();
  const notifId = settings.notif || '1';

  // Gunakan audio API chrome untuk memutar suara di background
  chrome.runtime.sendMessage({
    action: 'playNotificationSound',
    audioSrc: audioOptions.find((opt) => opt.id === notifId)?.src,
  });
}

// Simpan pengaturan timer ke storage
function saveSettings() {
  const pomodoroInput = document.querySelector('input[label-for="pomodoro"]');
  const shortBreakInput = document.querySelector('input[label-for="shortbreak"]');
  const longBreakInput = document.querySelector('input[label-for="longbreak"]');

  let pomodoro = pomodoroInput ? parseInt(pomodoroInput.value) || 25 : 25;
  let shortbreak = shortBreakInput ? parseInt(shortBreakInput.value) || 5 : 5;
  let longbreak = longBreakInput ? parseInt(longBreakInput.value) || 15 : 15;

  if (pomodoro < 1 || shortbreak < 1 || longbreak < 1) {
    if (document.querySelector('body')) {
      alert('Durasi waktu minimal adalah 1 menit.');
    }

    if (pomodoroInput && pomodoro < 1) {
      pomodoro = 1;
      pomodoroInput.value = 1;
    }
    if (shortBreakInput && shortbreak < 1) {
      shortbreak = 1;
      shortBreakInput.value = 1;
    }
    if (longBreakInput && longbreak < 1) {
      longbreak = 1;
      longBreakInput.value = 1;
    }
  }

  const notif = Object.keys(audioElements).find((key) => audioElements[key] === selectedAudio) || '1';

  // Simpan pengaturan ke chrome.storage untuk konsistensi di seluruh ekstensi
  chrome.storage.local.set(
    {
      'focusoi-settings': { pomodoro, shortbreak, longbreak, notif },
    },
    () => {
      // Setelah pengaturan disimpan, kirim pesan ke background untuk memperbarui durasi jika tidak sedang berjalan
      chrome.runtime.sendMessage(
        {
          action: 'updateSettings',
          settings: { pomodoro, shortbreak, longbreak, notif },
          updateTimer: !isRunning, // Hanya update timer jika sedang tidak berjalan
        },
        (response) => {
          if (response && !isRunning) {
            currentTime = response.currentTime;
            updateDisplay();
          }
        }
      );
    }
  );
}

// Ambil pengaturan dari storage
function getSettings() {
  const defaultSettings = {
    pomodoro: 25,
    shortbreak: 5,
    longbreak: 15,
    notif: '1',
  };

  // Buat variabel untuk menyimpan pengaturan tersimpan
  let storedSettings = null;

  // Mengambil pengaturan dari chrome.storage secara sinkron
  // menggunakan fungsi synchronous untuk mencegah race condition
  try {
    // Gunakan chrome.storage.local.get dalam versi sinkron
    chrome.storage.local.get('focusoi-settings', (result) => {
      storedSettings = result['focusoi-settings'];
      applySettings(storedSettings || defaultSettings);
    });
  } catch (e) {
    console.error('Error retrieving stored settings:', e);
    applySettings(defaultSettings);
  }

  // Fungsi untuk menerapkan pengaturan ke UI
  function applySettings(settings) {
    // Jika halaman UI terbuka, set nilai input
    const setInput = (label, val) => {
      const input = document.querySelector(`input[label-for="${label}"]`);
      if (input) input.value = val;
    };

    setInput('pomodoro', settings.pomodoro);
    setInput('shortbreak', settings.shortbreak);
    setInput('longbreak', settings.longbreak);

    // Set audio yang dipilih
    if (Object.keys(audioElements).length > 0) {
      selectedAudio = audioElements[settings.notif] || audioElements['1'];

      document.querySelectorAll('.notification-sound').forEach((el) => el.classList.remove('active'));
      const activeDiv = document.getElementById(settings.notif);
      if (activeDiv) activeDiv.classList.add('active');
    }
  }

  // Untuk menjaga kompatibilitas dengan fungsi lama, selalu kembalikan pengaturan default
  // pengaturan sebenarnya akan diterapkan secara asinkron oleh fungsi applySettings
  return defaultSettings;
}

// Simpan status runtime ke chrome.storage
function saveRuntimeState() {
  const runtimeState = {
    currentTime,
    isRunning,
    mode,
    lastUpdated: Date.now(),
  };

  chrome.storage.local.set({ 'focusoi-runtime': runtimeState });
}

// Memulihkan status runtime dari storage
function restoreRuntimeState() {
  // Coba ambil dari chrome.storage.local terlebih dahulu
  chrome.storage.local.get('focusoi-runtime', (result) => {
    const data = result['focusoi-runtime'];

    if (!data) {
      // Coba ambil dari localStorage (untuk kompatibilitas mundur)
      try {
        const localData = JSON.parse(localStorage.getItem('focusoi-runtime'));
        if (localData) {
          processRuntimeData(localData);
          // Migrasi ke chrome.storage
          chrome.storage.local.set({ 'focusoi-runtime': localData });
          localStorage.removeItem('focusoi-runtime');
          return;
        }
      } catch (e) {
        console.error('Error parsing localStorage runtime data:', e);
      }

      setMode('pomodoro');
      return;
    }

    processRuntimeData(data);
  });

  function processRuntimeData(data) {
    const elapsed = Math.floor((Date.now() - data.lastUpdated) / 1000);
    let remaining = data.currentTime - elapsed;

    if (remaining > 0) {
      currentTime = remaining;
      mode = data.mode;
      isRunning = data.isRunning;

      setMode(mode);
      updateDisplay();

      if (isRunning) {
        toggleTimer();
      }
    } else {
      chrome.storage.local.remove('focusoi-runtime');
      setMode('pomodoro');
    }
  }
}

// Update display function untuk mengubah nilai timer secara real-time
function updateInputs() {
  chrome.storage.local.get('focusoi-settings', (result) => {
    const settings = result['focusoi-settings'] || { pomodoro: 25, shortbreak: 5, longbreak: 15, notif: '1' };

    const pomodoroInput = document.querySelector('input[label-for="pomodoro"]');
    const shortBreakInput = document.querySelector('input[label-for="shortbreak"]');
    const longBreakInput = document.querySelector('input[label-for="longbreak"]');

    if (pomodoroInput) pomodoroInput.value = settings.pomodoro;
    if (shortBreakInput) shortBreakInput.value = settings.shortbreak;
    if (longBreakInput) longBreakInput.value = settings.longbreak;
  });
}

// Inisialisasi event listeners untuk popup UI
function initUI() {
  if (!document.querySelector('body')) return;

  ['pomodoro', 'shortbreak', 'longbreak'].forEach((label) => {
    const input = document.querySelector(`input[label-for="${label}"]`);
    if (input) {
      // Update event listener untuk mengubah nilai secara real-time
      input.addEventListener('input', () => {
        let val = parseInt(input.value) || 1;
        if (val < 1) val = 1;

        // Update currentTime jika label sesuai mode aktif
        if (mode === label) {
          currentTime = val * 60;

          if (!isRunning) {
            updateDisplay();
          }

          // Simpan state runtime segera
          saveRuntimeState();

          // Kirim pesan ke background untuk update currentTime secara sinkron
          chrome.runtime.sendMessage({
            action: 'setCurrentTimeFromPopup',
            currentTime,
            mode,
          });
        }

        // Simpan pengaturan (tetap dilakukan meskipun bukan mode aktif)
        saveSettings();
      });

      input.setAttribute('min', '1');
    }
  });

  const resetButton = document.getElementById('reset-settings');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      chrome.storage.local.remove(['focusoi-settings', 'focusoi-runtime']);
      selectedAudio = null;
      Object.values(audioElements).forEach((a) => {
        a.pause();
        a.currentTime = 0;
      });
      document.querySelectorAll('.notification-sound').forEach((el) => el.classList.remove('active'));
      getSettings();
      setMode('pomodoro');
      updateDisplay();
    });
  }

  if (startButton) {
    startButton.addEventListener('click', toggleTimer);
  }

  if (pomodoroBtn) {
    pomodoroBtn.addEventListener('click', () => setMode('pomodoro'));
  }

  if (shortBreakBtn) {
    shortBreakBtn.addEventListener('click', () => setMode('shortbreak'));
  }

  if (longBreakBtn) {
    longBreakBtn.addEventListener('click', () => setMode('longbreak'));
  }
}

// Setup listener untuk event dari background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateTimer') {
    currentTime = request.currentTime;
    isRunning = request.isRunning;
    mode = request.mode;
    updateDisplay();
    sendResponse({ status: 'updated' });
  }
});

// Fungsi untuk mendapatkan status terkini dari background
function getCurrentState() {
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      currentTime = response.currentTime;
      isRunning = response.isRunning;
      mode = response.mode;

      // Update UI berdasarkan state terkini
      updateDisplay();

      if (document.querySelector('body')) {
        document.querySelector('body').className = mode;
      }

      const buttons = [pomodoroBtn, shortBreakBtn, longBreakBtn].filter((btn) => btn);
      buttons.forEach((btn) => btn.classList.remove('active'));

      if (mode === 'pomodoro' && pomodoroBtn) pomodoroBtn.classList.add('active');
      if (mode === 'shortbreak' && shortBreakBtn) shortBreakBtn.classList.add('active');
      if (mode === 'longbreak' && longBreakBtn) longBreakBtn.classList.add('active');

      if (startButton) {
        startButton.querySelector('span').textContent = isRunning ? 'Pause' : 'Mulai';
      }
    }
  });
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  // Mengambil pengaturan terbaru ketika popup dibuka
  chrome.storage.local.get('focusoi-settings', (result) => {
    if (result['focusoi-settings']) {
      // Update nilai input dengan pengaturan tersimpan
      updateInputs();
    }
    // Inisialisasi UI
    initUI();
    // Dapatkan status timer terkini
    getCurrentState();
  });
});

// Refresh status setiap detik jika popup terbuka
setInterval(() => {
  getCurrentState();
  // Tambahkan pengecekan ini untuk selalu memastikan input fields menampilkan nilai terbaru
  updateInputs();
}, 1000);

// Ekspor fungsi-fungsi yang dibutuhkan oleh background script
window.timerFunctions = {
  toggleTimer,
  setMode,
  formatTime,
  updateDisplay,
};
