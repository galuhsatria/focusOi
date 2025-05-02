let timer;
let isRunning = false;
let currentTime = 1500; // 25 menit default
let mode = 'pomodoro';
let notificationAudio = null;

// Memformat waktu seperti di UI
function formatTime(seconds) {
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

// Update badge di ikon ekstensi
function updateBadge() {
  const minutes = Math.ceil(currentTime / 60);
  chrome.browserAction.setBadgeText({ text: minutes.toString() });

  // Warna badge sesuai mode
  const badgeColor = mode === 'pomodoro' ? '#d95550' : mode === 'shortbreak' ? '#4c9195' : '#457ca3';
  chrome.browserAction.setBadgeBackgroundColor({ color: badgeColor });
}

// Menjalankan timer di background
function runTimer() {
  if (timer) {
    clearInterval(timer);
  }

  // Simpan waktu mulai untuk menghindari drift
  const startTime = Date.now();
  let elapsedSeconds = 0;

  timer = setInterval(() => {
    // Hitung waktu yang telah berlalu secara akurat
    const expectedElapsed = Math.floor((Date.now() - startTime) / 1000);

    // Jika ada perbedaan yang signifikan, sesuaikan
    if (expectedElapsed > elapsedSeconds) {
      const secondsToDecrease = expectedElapsed - elapsedSeconds;
      currentTime = Math.max(0, currentTime - secondsToDecrease);
      elapsedSeconds = expectedElapsed;

      updateBadge();
      saveRuntimeState();

      // Broadcast ke semua popup yang terbuka
      chrome.runtime.sendMessage({
        action: 'updateTimer',
        currentTime: currentTime,
        isRunning: isRunning,
        mode: mode,
      });

      // Cek apakah waktu habis
      if (currentTime <= 0) {
        clearInterval(timer);
        isRunning = false;

        // Notifikasi
        createNotification();

        // Putar audio
        playNotificationSound();

        // Reset state runtime
        chrome.storage.local.remove('focusoi-runtime');
      }
    }
  }, 250); // Lebih sering mengecek untuk akurasi yang lebih baik
}

// Membuat notifikasi desktop
function createNotification() {
  const title = 'Waktu habis! 🚨';
  const message = `Sesi ${mode} selesai.`;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: title,
    message: message,
    priority: 2,
  });
}

// Memutar suara notifikasi
function playNotificationSound() {
  // Ambil pengaturan suara notifikasi
  chrome.storage.local.get('focusoi-settings', (result) => {
    if (!result || !result['focusoi-settings']) return;

    const settings = result['focusoi-settings'];
    const notifId = settings.notif || '1';

    const audioOptions = [
      { id: '1', label: 'Notif 1', src: './sounds/notif1.mp3' },
      { id: '2', label: 'Notif 2', src: './sounds/notif2.mp3' },
      { id: '3', label: 'Notif 3', src: './sounds/notif3.mp3' },
    ];

    const audioSrc = audioOptions.find((opt) => opt.id === notifId)?.src;

    if (audioSrc) {
      if (notificationAudio) {
        notificationAudio.pause();
        notificationAudio = null;
      }

      notificationAudio = new Audio(audioSrc);
      notificationAudio.play();
    }
  });
}

// Menyimpan state timer ke storage
function saveRuntimeState() {
  const runtimeState = {
    currentTime,
    isRunning,
    mode,
    lastUpdated: Date.now(),
  };

  chrome.storage.local.set({ 'focusoi-runtime': runtimeState });
}

// Memulihkan state timer dari storage
function restoreRuntimeState() {
  chrome.storage.local.get(['focusoi-runtime', 'focusoi-settings', 'currentMode'], (result) => {
    // Restore mode jika tersimpan
    if (result.currentMode) {
      mode = result.currentMode;
    }

    // Restore runtime state jika ada
    if (result['focusoi-runtime']) {
      const data = result['focusoi-runtime'];
      const elapsed = Math.floor((Date.now() - data.lastUpdated) / 1000);
      let remaining = data.currentTime - elapsed;

      if (remaining > 0) {
        currentTime = remaining;
        mode = data.mode;
        isRunning = data.isRunning;

        updateBadge();

        if (isRunning) {
          runTimer();
        }
      } else {
        // Waktu habis, reset
        chrome.storage.local.remove('focusoi-runtime');

        // Set waktu default berdasarkan pengaturan yang tersimpan
        setDefaultTime();
      }
    } else {
      // Tidak ada runtime state, set waktu default
      setDefaultTime();
    }
  });
}

// Set waktu default berdasarkan mode dan pengaturan
function setDefaultTime() {
  chrome.storage.local.get('focusoi-settings', (result) => {
    const settings = result['focusoi-settings'] || {
      pomodoro: 25,
      shortbreak: 5,
      longbreak: 15,
      notif: '1',
    };

    switch (mode) {
      case 'pomodoro':
        currentTime = settings.pomodoro * 60;
        break;
      case 'shortbreak':
        currentTime = settings.shortbreak * 60;
        break;
      case 'longbreak':
        currentTime = settings.longbreak * 60;
        break;
      default:
        currentTime = settings.pomodoro * 60;
        mode = 'pomodoro';
    }

    updateBadge();
  });
}

// Menangani pesan dari UI script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'playNotificationSound') {
    if (request.audioSrc) {
      if (notificationAudio) {
        notificationAudio.pause();
        notificationAudio = null;
      }

      notificationAudio = new Audio(request.audioSrc);
      notificationAudio.play();
    }
    sendResponse({ status: 'playing' });
    return true;
  }

  if (request.action === 'toggleTimer') {
    isRunning = !isRunning;

    if (isRunning) {
      runTimer();
    } else if (timer) {
      clearInterval(timer);
    }

    saveRuntimeState();
    sendResponse({ isRunning: isRunning });
    return true;
  }

  if (request.action === 'setMode') {
    if (timer) {
      clearInterval(timer);
    }

    // Jika timer sedang berjalan, berhenti dulu
    const wasRunning = isRunning;
    isRunning = false;

    mode = request.mode;

    chrome.storage.local.get('focusoi-settings', (result) => {
      const settings = result['focusoi-settings'] || {
        pomodoro: 25,
        shortbreak: 5,
        longbreak: 15,
      };

      switch (mode) {
        case 'pomodoro':
          currentTime = settings.pomodoro * 60;
          break;
        case 'shortbreak':
          currentTime = settings.shortbreak * 60;
          break;
        case 'longbreak':
          currentTime = settings.longbreak * 60;
          break;
      }

      updateBadge();

      // Simpan mode saat ini
      chrome.storage.local.set({ currentMode: mode });

      // Jika sebelumnya timer berjalan, jalankan lagi dengan mode baru
      if (wasRunning) {
        isRunning = true;
        runTimer();
      }

      saveRuntimeState();

      sendResponse({
        mode: mode,
        currentTime: currentTime,
        isRunning: isRunning,
      });
    });

    return true;
  }

  if (request.action === 'updateSettings') {
    // Update pengaturan dan timer jika diminta
    chrome.storage.local.get('focusoi-settings', (result) => {
      // Gabungkan pengaturan baru dengan yang ada
      const oldSettings = result['focusoi-settings'] || {};
      const newSettings = { ...oldSettings, ...request.settings };

      chrome.storage.local.set({ 'focusoi-settings': newSettings }, () => {
        // Jika diminta untuk memperbarui timer dan timer tidak sedang berjalan
        if (request.updateTimer && !isRunning) {
          switch (mode) {
            case 'pomodoro':
              currentTime = newSettings.pomodoro * 60;
              break;
            case 'shortbreak':
              currentTime = newSettings.shortbreak * 60;
              break;
            case 'longbreak':
              currentTime = newSettings.longbreak * 60;
              break;
          }

          updateBadge();
          saveRuntimeState();
        }

        sendResponse({
          currentTime: currentTime,
          settings: newSettings,
        });
      });
    });

    return true;
  }

  if (request.action === 'setCurrentTimeFromPopup') {
    const { currentTime, mode } = request;

    // Update runtime state sesuai data baru dari popup
    runtimeState.currentTime = currentTime;
    runtimeState.mode = mode;
    runtimeState.lastUpdated = Date.now();

    chrome.storage.local.set({ 'focusoi-runtime': runtimeState });
    sendResponse({ status: 'ok' });
  }

  if (request.action === 'getState') {
    sendResponse({
      currentTime: currentTime,
      isRunning: isRunning,
      mode: mode,
    });
    return true;
  }
});

// Inisialisasi
restoreRuntimeState();

// Set handler untuk klik pada ikon ekstensi (optional)
chrome.browserAction.onClicked.addListener(() => {
  // Jika ingin membuka popup secara manual, bisa diaktifkan di sini
  // chrome.browserAction.setPopup({popup: 'popup.html'});
});
