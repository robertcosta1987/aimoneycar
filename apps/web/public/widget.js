(function () {
  'use strict';

  const script = document.currentScript;
  const dealershipSlug = script.getAttribute('data-dealership');
  const primaryColor = script.getAttribute('data-color') || '#00D9FF';
  const position = script.getAttribute('data-position') || 'bottom-right';
  const greeting = script.getAttribute('data-greeting') || 'Olá! Posso ajudar a encontrar seu próximo carro? 🚗';
  const apiUrl = script.getAttribute('data-api') || new URL(script.src).origin;

  if (!dealershipSlug) {
    console.error('Moneycar Widget: data-dealership é obrigatório');
    return;
  }

  // Visitor tracking
  let visitorId = localStorage.getItem('mc_visitor');
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('mc_visitor', visitorId);
  }

  // Conversation state
  let conversationId = null;
  let messages = [];
  let isOpen = false;
  let isTyping = false;

  // ── Styles ───────────────────────────────────────────────────────────────

  const styles = document.createElement('style');
  styles.textContent = `
    #mc-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; }
    #mc-btn {
      position: fixed;
      ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      bottom: 20px;
      width: 60px; height: 60px;
      border-radius: 50%;
      background: ${primaryColor};
      border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      z-index: 99998;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #mc-btn:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    #mc-btn svg { width: 28px; height: 28px; }
    #mc-badge {
      position: absolute; top: -2px; right: -2px;
      width: 18px; height: 18px;
      background: #ef4444; border-radius: 50%;
      color: white; font-size: 11px; font-weight: 700;
      display: none; align-items: center; justify-content: center;
      border: 2px solid white;
    }
    #mc-window {
      position: fixed;
      ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      bottom: 90px;
      width: 380px; height: 540px;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.22);
      display: none; flex-direction: column;
      overflow: hidden; z-index: 99997;
      animation: mc-slide-up 0.25s ease;
    }
    @keyframes mc-slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #mc-window.open { display: flex; }
    #mc-header {
      background: ${primaryColor};
      color: ${isLightColor(primaryColor) ? '#111' : '#fff'};
      padding: 14px 16px;
      display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
    }
    #mc-avatar {
      width: 42px; height: 42px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
    }
    #mc-header-info { flex: 1; }
    #mc-title { font-size: 15px; font-weight: 700; line-height: 1.2; }
    #mc-subtitle { font-size: 12px; opacity: 0.85; margin-top: 2px; }
    #mc-close {
      background: none; border: none; cursor: pointer;
      color: inherit; opacity: 0.8; padding: 4px;
      display: flex; align-items: center;
    }
    #mc-close:hover { opacity: 1; }
    #mc-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      background: #f5f7fa;
      display: flex; flex-direction: column; gap: 8px;
      scroll-behavior: smooth;
    }
    .mc-msg {
      max-width: 82%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 14px; line-height: 1.5;
      word-wrap: break-word; white-space: pre-wrap;
    }
    .mc-msg.bot {
      background: #fff;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      align-self: flex-start;
    }
    .mc-msg.user {
      background: ${primaryColor};
      color: ${isLightColor(primaryColor) ? '#111' : '#fff'};
      border-bottom-right-radius: 4px;
      align-self: flex-end;
    }
    .mc-time {
      font-size: 10px; color: #aaa;
      align-self: flex-start;
      margin-top: -4px; padding-left: 4px;
    }
    .mc-time.user-time { align-self: flex-end; padding-right: 4px; }
    #mc-typing {
      display: none; align-items: center; gap: 4px;
      padding: 10px 14px;
      background: #fff; border-radius: 18px; border-bottom-left-radius: 4px;
      width: fit-content;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    #mc-typing.show { display: flex; }
    #mc-typing span {
      width: 7px; height: 7px;
      background: #bbb; border-radius: 50%;
      animation: mc-bounce 1.3s infinite ease-in-out;
    }
    #mc-typing span:nth-child(1) { animation-delay: -0.3s; }
    #mc-typing span:nth-child(2) { animation-delay: -0.15s; }
    @keyframes mc-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }
    #mc-input-area {
      padding: 12px;
      background: #fff;
      border-top: 1px solid #eee;
      display: flex; gap: 8px; align-items: flex-end;
      flex-shrink: 0;
    }
    #mc-input {
      flex: 1;
      padding: 10px 14px;
      border: 1.5px solid #e5e7eb;
      border-radius: 24px;
      font-size: 14px; outline: none;
      resize: none; max-height: 80px;
      line-height: 1.4;
      transition: border-color 0.15s;
    }
    #mc-input:focus { border-color: ${primaryColor}; }
    #mc-send {
      width: 40px; height: 40px; flex-shrink: 0;
      background: ${primaryColor};
      border: none; border-radius: 50%;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.15s, transform 0.15s;
    }
    #mc-send:hover:not(:disabled) { transform: scale(1.05); }
    #mc-send:disabled { opacity: 0.4; cursor: not-allowed; }
    #mc-send svg { width: 18px; height: 18px; }
    #mc-powered {
      text-align: center; font-size: 10px; color: #ccc;
      padding: 4px 0 8px;
      background: #fff; flex-shrink: 0;
    }
    @media (max-width: 420px) {
      #mc-window {
        width: calc(100vw - 16px);
        height: calc(100dvh - 100px);
        ${position.includes('right') ? 'right: 8px;' : 'left: 8px;'}
        bottom: 76px;
        border-radius: 16px;
      }
      #mc-btn { ${position.includes('right') ? 'right: 16px;' : 'left: 16px;'} bottom: 16px; }
    }
  `;
  document.head.appendChild(styles);

  // ── DOM ──────────────────────────────────────────────────────────────────

  const container = document.createElement('div');
  container.id = 'mc-widget';
  container.innerHTML = `
    <button id="mc-btn" aria-label="Abrir chat">
      <span id="mc-badge"></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="${isLightColor(primaryColor) ? '#111' : '#fff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <div id="mc-window" role="dialog" aria-label="Chat de atendimento">
      <div id="mc-header">
        <div id="mc-avatar">🚗</div>
        <div id="mc-header-info">
          <div id="mc-title">Atendimento Online</div>
          <div id="mc-subtitle">● Online agora</div>
        </div>
        <button id="mc-close" aria-label="Fechar chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="mc-messages">
        <div id="mc-typing"><span></span><span></span><span></span></div>
      </div>
      <div id="mc-input-area">
        <textarea id="mc-input" placeholder="Digite sua mensagem..." rows="1"></textarea>
        <button id="mc-send" disabled aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="none" stroke="${isLightColor(primaryColor) ? '#111' : '#fff'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div id="mc-powered">Powered by Moneycar AI</div>
    </div>
  `;
  document.body.appendChild(container);

  // ── Element refs ─────────────────────────────────────────────────────────

  const btn = document.getElementById('mc-btn');
  const win = document.getElementById('mc-window');
  const msgContainer = document.getElementById('mc-messages');
  const typingEl = document.getElementById('mc-typing');
  const inputEl = document.getElementById('mc-input');
  const sendBtn = document.getElementById('mc-send');
  const closeBtn = document.getElementById('mc-close');
  const badge = document.getElementById('mc-badge');

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isLightColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 155;
  }

  function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function scrollToBottom() {
    setTimeout(() => { msgContainer.scrollTop = msgContainer.scrollHeight; }, 50);
  }

  function appendMessage(text, role) {
    const div = document.createElement('div');
    div.className = 'mc-msg ' + (role === 'user' ? 'user' : 'bot');
    div.textContent = text;

    const time = document.createElement('div');
    time.className = 'mc-time ' + (role === 'user' ? 'user-time' : '');
    time.textContent = formatTime(new Date());

    // Insert before typing indicator
    msgContainer.insertBefore(div, typingEl);
    msgContainer.insertBefore(time, typingEl);
    scrollToBottom();
  }

  function setTyping(show) {
    isTyping = show;
    typingEl.classList.toggle('show', show);
    sendBtn.disabled = show;
    scrollToBottom();
  }

  function showBadge(n) {
    if (n > 0) { badge.textContent = n > 9 ? '9+' : n; badge.style.display = 'flex'; }
    else { badge.style.display = 'none'; }
  }

  // ── Open / Close ─────────────────────────────────────────────────────────

  function openChat() {
    isOpen = true;
    win.classList.add('open');
    showBadge(0);
    inputEl.focus();
    scrollToBottom();

    // Send greeting on first open
    if (messages.length === 0) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        appendMessage(greeting, 'assistant');
        messages.push({ role: 'assistant', content: greeting });
      }, 700);
    }
  }

  function closeChat() {
    isOpen = false;
    win.classList.remove('open');
  }

  btn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (isOpen && !container.contains(e.target)) closeChat();
  });

  // ── Send message ─────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isTyping) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    appendMessage(text, 'user');
    messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });

    setTyping(true);

    try {
      const res = await fetch(`${apiUrl}/api/widget/${dealershipSlug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, visitorId, conversationId }),
      });

      const data = await res.json();

      setTyping(false);

      if (data.conversationId && !conversationId) conversationId = data.conversationId;

      const reply = data.message || 'Desculpe, não consegui processar sua mensagem.';
      appendMessage(reply, 'assistant');
      messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });

      // Show notification badge if chat is closed
      if (!isOpen) showBadge(1);
    } catch (err) {
      setTyping(false);
      appendMessage('Erro de conexão. Por favor, tente novamente.', 'assistant');
    }
  }

  sendBtn.addEventListener('click', sendMessage);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    const hasText = inputEl.value.trim().length > 0;
    sendBtn.disabled = !hasText || isTyping;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });

  // Auto-open after 5s if not dismissed before
  const dismissed = sessionStorage.getItem('mc_dismissed');
  if (!dismissed) {
    setTimeout(() => {
      if (!isOpen) {
        openChat();
        sessionStorage.setItem('mc_auto_opened', '1');
      }
    }, 5000);
  }

  closeBtn.addEventListener('click', () => {
    sessionStorage.setItem('mc_dismissed', '1');
    closeChat();
  });

})();
