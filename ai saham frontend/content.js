// ============================================================
//  AI Saham Analyzer — Content Script
//  Injects floating chat widget and connects to Gemini backend
// ============================================================

(function () {
  'use strict';

  // Prevent double-injection
  if (document.getElementById('asa-fab')) return;

  // ============================================================
  //  CONFIGURATION
  //  Update API_BASE_URL to your deployed Vercel backend URL
  // ============================================================
  const API_BASE_URL = 'http://localhost:3001'; // ← Change to your Vercel URL after deployment
  const API_CHAT_ENDPOINT = `${API_BASE_URL}/api/chat`;

  // ---- Conversation History (for multi-turn context) ----
  let conversationHistory = [];
  const MAX_HISTORY_TURNS = 20;

  // ---- Loading State ----
  let isLoading = false;

  // ---- SVG Icons ----
  const ICONS = {
    chat: `<svg class="asa-icon-chat" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>`,
    close: `<svg class="asa-icon-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    brain: `<svg viewBox="0 0 24 24"><path d="M12 2a9 9 0 0 0-9 9c0 3.07 1.64 5.64 4 7.28V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.72c2.36-1.64 4-4.21 4-7.28a9 9 0 0 0-9-9zm-1 15h2v1h-2v-1zm3.5-4.16l-1.5 1.04V15h-2v-1.12l-1.5-1.04A3.98 3.98 0 0 1 8 9.5 4 4 0 0 1 12 6a4 4 0 0 1 4 3.5c0 1.4-.73 2.58-1.5 3.34z"/></svg>`,
    send: `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    minimize: `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`,
    sparkle: `<svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z"/></svg>`,
  };

  // ---- Market Data ----
  const TICKERS = [
    { symbol: 'BBRI', price: '4,850', change: '+1.25%', up: true },
    { symbol: 'TLKM', price: '3,720', change: '-0.53%', up: false },
    { symbol: 'BBCA', price: '9,475', change: '+0.85%', up: true },
    { symbol: 'GOTO', price: '82',    change: '+3.16%', up: true },
    { symbol: 'ANTM', price: '1,620', change: '-1.22%', up: false },
  ];

  // ---- Quick Action Buttons ----
  const QUICK_ACTIONS = [
    '📊 Analisis IHSG',
    '🔥 Saham Trending',
    '💡 Rekomendasi Hari Ini',
    '📈 Sinyal Beli',
  ];

  // ============================================================
  //  AI API COMMUNICATION
  // ============================================================

  /**
   * Send a message to the backend and get an AI response
   * @param {string} userMessage - The user's prompt
   * @returns {Promise<string>} - The AI's reply text
   */
  async function getAIResponse(userMessage) {
    const response = await fetch(API_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        history: conversationHistory.slice(-MAX_HISTORY_TURNS),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Use the backend's structured error message
      throw new Error(data.error || `Server error (${response.status})`);
    }

    if (!data.success) {
      throw new Error(data.error || 'Respons tidak valid dari server.');
    }

    return data.data.reply;
  }

  /**
   * Add a turn to conversation history for multi-turn context
   * @param {'user'|'model'} role
   * @param {string} content
   */
  function addToHistory(role, content) {
    conversationHistory.push({ role, content });
    // Trim to prevent unbounded growth
    if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);
    }
  }

  // ============================================================
  //  BUILD DOM
  // ============================================================

  function createWidget() {
    // --- FAB ---
    const fab = document.createElement('div');
    fab.id = 'asa-fab';
    fab.innerHTML = `
      ${ICONS.chat}
      ${ICONS.close}
      <div class="asa-pulse-ring"></div>
    `;

    // --- Chat Window ---
    const win = document.createElement('div');
    win.id = 'asa-chat-window';

    // Header
    const header = document.createElement('div');
    header.id = 'asa-chat-header';
    header.innerHTML = `
      <div class="asa-avatar">${ICONS.brain}</div>
      <div class="asa-header-info">
        <div class="asa-header-title">AI Saham Analyzer</div>
        <div class="asa-header-status">
          <span class="asa-status-dot"></span>
          <span class="asa-status-text">Online — Market Open</span>
        </div>
      </div>
      <div class="asa-header-actions">
        <button class="asa-header-btn" id="asa-btn-minimize" title="Minimize">
          ${ICONS.minimize}
        </button>
      </div>
    `;

    // Ticker bar
    const ticker = document.createElement('div');
    ticker.id = 'asa-ticker-bar';
    ticker.innerHTML = TICKERS.map(
      (t) => `
      <div class="asa-ticker-item">
        <span class="asa-ticker-symbol">${t.symbol}</span>
        <span class="asa-ticker-price">${t.price}</span>
        <span class="asa-ticker-change ${t.up ? 'up' : 'down'}">${t.change}</span>
      </div>`
    ).join('');

    // Messages
    const messages = document.createElement('div');
    messages.id = 'asa-chat-messages';

    // Quick actions
    const quickActions = document.createElement('div');
    quickActions.id = 'asa-quick-actions';
    quickActions.innerHTML = QUICK_ACTIONS.map(
      (label) => `<button class="asa-quick-btn">${label}</button>`
    ).join('');

    // Input area
    const inputArea = document.createElement('div');
    inputArea.id = 'asa-chat-input-area';
    inputArea.innerHTML = `
      <textarea id="asa-chat-input" placeholder="Tanya tentang saham..." rows="1"></textarea>
      <button id="asa-chat-send" title="Kirim">${ICONS.send}</button>
    `;

    // Assemble
    win.appendChild(header);
    win.appendChild(ticker);
    win.appendChild(messages);
    win.appendChild(quickActions);
    win.appendChild(inputArea);

    document.body.appendChild(win);
    document.body.appendChild(fab);

    return { fab, win, messages };
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  function getTime() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(container, text, sender = 'bot') {
    const wrapper = document.createElement('div');
    wrapper.className = `asa-msg asa-${sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'asa-msg-bubble';
    // Simple markdown bold
    bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    const time = document.createElement('div');
    time.className = 'asa-msg-time';
    time.textContent = getTime();

    wrapper.appendChild(bubble);
    wrapper.appendChild(time);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(container) {
    const typing = document.createElement('div');
    typing.className = 'asa-msg asa-bot';
    typing.id = 'asa-typing';
    typing.innerHTML = `
      <div class="asa-typing">
        <div class="asa-typing-dot"></div>
        <div class="asa-typing-dot"></div>
        <div class="asa-typing-dot"></div>
      </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('asa-typing');
    if (el) el.remove();
  }

  /**
   * Set loading state — disables input & send button during API calls
   */
  function setLoading(loading) {
    isLoading = loading;
    const input = document.getElementById('asa-chat-input');
    const sendBtn = document.getElementById('asa-chat-send');
    if (input) {
      input.disabled = loading;
      input.placeholder = loading ? 'AI sedang berpikir...' : 'Tanya tentang saham...';
    }
    if (sendBtn) {
      sendBtn.disabled = loading;
      sendBtn.style.opacity = loading ? '0.5' : '1';
    }
  }

  // ============================================================
  //  SEND MESSAGE (REAL AI)
  // ============================================================

  /**
   * Core send function — sends user message to backend,
   * displays typing indicator, and renders the AI reply.
   * @param {string} text - User message text
   */
  async function sendMessage(text) {
    if (isLoading || !text) return;

    // Display user message in the chat
    addMessage(messages, text, 'user');

    // Track in conversation history
    addToHistory('user', text);

    // Show typing indicator and lock input
    showTyping(messages);
    setLoading(true);

    try {
      // Call the real backend API
      const reply = await getAIResponse(text);

      removeTyping();
      addMessage(messages, reply, 'bot');

      // Track bot reply in history for multi-turn context
      addToHistory('model', reply);

    } catch (error) {
      removeTyping();
      console.error('[AI Saham Analyzer] API Error:', error.message);

      // User-friendly error message
      const errorMsg = error.message.includes('Failed to fetch') || error.message.includes('NetworkError')
        ? '⚠️ **Koneksi Gagal**\n\nTidak dapat terhubung ke server AI. Pastikan backend berjalan di `' + API_BASE_URL + '` atau cek koneksi internet Anda.'
        : `⚠️ **Error:** ${error.message}`;

      addMessage(messages, errorMsg, 'bot');

    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  //  INITIALIZE
  // ============================================================

  const { fab, win, messages } = createWidget();
  let isOpen = false;

  // Welcome message
  setTimeout(() => {
    addMessage(
      messages,
      '👋 **Selamat datang di AI Saham Analyzer!**\n\nSaya asisten AI trading Anda, didukung oleh **Google Gemini AI**. Tanyakan analisis saham, sinyal trading, atau kondisi pasar terkini.\n\n💡 Gunakan tombol cepat di bawah untuk memulai!',
      'bot'
    );
  }, 400);

  // Toggle chat window
  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('asa-open', isOpen);
    fab.classList.toggle('asa-active', isOpen);
  });

  // Minimize button
  document.getElementById('asa-btn-minimize').addEventListener('click', () => {
    isOpen = false;
    win.classList.remove('asa-open');
    fab.classList.remove('asa-active');
  });

  // ---- Send via button or Enter key ----
  function handleSend() {
    const input = document.getElementById('asa-chat-input');
    const text = input.value.trim();
    if (!text || isLoading) return;

    input.value = '';
    input.style.height = 'auto';
    sendMessage(text);
  }

  document.getElementById('asa-chat-send').addEventListener('click', handleSend);
  document.getElementById('asa-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  document.getElementById('asa-chat-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  // ---- Quick action buttons → real AI ----
  document.querySelectorAll('.asa-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isLoading) return;
      sendMessage(btn.textContent.trim());
    });
  });

  // Animate ticker scroll
  const tickerBar = document.getElementById('asa-ticker-bar');
  let tickerScroll = 0;
  function animateTicker() {
    tickerScroll += 0.4;
    if (tickerScroll >= tickerBar.scrollWidth - tickerBar.clientWidth) {
      tickerScroll = 0;
    }
    tickerBar.scrollLeft = tickerScroll;
    requestAnimationFrame(animateTicker);
  }
  if (tickerBar.scrollWidth > tickerBar.clientWidth) {
    animateTicker();
  }

  console.log('%c🚀 AI Saham Analyzer loaded — connected to ' + API_BASE_URL, 'color: #00e5a0; font-weight: bold; font-size: 14px;');
})();
