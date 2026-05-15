/* ════════════════════════════════════════════════════════════
   Echo — Stratum's PR / voice agent, in the browser.
   A reusable text-to-speech widget that reads the current page.
   Default: Web Speech API (no key, works offline-ish).
   Optional: BYOK OpenAI TTS for premium-grade voice (HD voices).
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (window.__EchoLoaded) return;
  window.__EchoLoaded = true;

  // ── styles ─────────────────────────────────────────────────
  const css = `
.echo-btn {
  position: fixed;
  bottom: 12px;
  left: 12px;
  z-index: 9998;
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  padding: .55rem .85rem;
  background: rgba(14, 22, 38, 0.92);
  color: #f4ecda;
  font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  border: 1px solid rgba(184, 101, 31, 0.45);
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(14, 22, 38, 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: transform .12s ease, background .12s ease, border-color .15s ease;
}
.echo-btn:hover { transform: translateY(-1px); background: #0e1626; border-color: #b8651f; }
.echo-btn .dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #b8651f;
}
.echo-btn.is-playing .dot { animation: echo-pulse 1.2s ease-in-out infinite; }
@keyframes echo-pulse {
  0%, 100% { opacity: .35; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.35); }
}
.echo-btn-label { letter-spacing: .14em; }

.echo-panel {
  position: fixed;
  bottom: 56px;
  left: 12px;
  z-index: 9999;
  width: 320px;
  max-width: calc(100vw - 24px);
  background: #f4ecda;
  color: #0e1626;
  border: 1px solid #d8cdb6;
  border-top: 3px solid #b8651f;
  border-radius: 4px;
  font-family: "Newsreader", Georgia, serif;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 12px 32px rgba(14, 22, 38, 0.18);
  padding: 0;
  display: none;
}
.echo-panel.is-open { display: block; }
.echo-panel-head {
  padding: .75rem .9rem .55rem;
  border-bottom: 1px solid #d8cdb6;
  display: flex;
  align-items: center;
  gap: .55rem;
}
.echo-panel-mark {
  font-family: "Fraunces", serif;
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -.02em;
  flex: 1;
}
.echo-panel-mark i { color: #b8651f; font-style: italic; }
.echo-panel-close {
  background: transparent;
  border: 0;
  color: #4b5365;
  font-family: "JetBrains Mono", monospace;
  font-size: 16px;
  cursor: pointer;
  padding: .15rem .35rem;
  line-height: 1;
}
.echo-panel-close:hover { color: #b8651f; }

.echo-panel-body { padding: .8rem .9rem 1rem; }

.echo-status {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #4b5365;
  margin-bottom: .65rem;
}
.echo-status .ok { color: #4a5d3a; }
.echo-status .warn { color: #b8651f; }
.echo-status .err { color: #a13418; }

.echo-controls {
  display: flex;
  gap: .35rem;
  margin-bottom: .8rem;
}
.echo-controls button {
  flex: 1;
  padding: .45rem .35rem;
  border: 1px solid #d8cdb6;
  background: #f7f0e0;
  color: #0e1626;
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px;
  letter-spacing: .14em;
  text-transform: uppercase;
  border-radius: 2px;
  cursor: pointer;
}
.echo-controls button.is-primary { background: #0e1626; color: #f4ecda; border-color: #0e1626; }
.echo-controls button:hover { border-color: #b8651f; }
.echo-controls button:disabled { opacity: .4; cursor: not-allowed; }

.echo-progress {
  height: 4px;
  background: #d8cdb6;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: .8rem;
}
.echo-progress-bar {
  height: 100%;
  background: #b8651f;
  width: 0;
  transition: width .25s linear;
}

.echo-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: .55rem;
  align-items: center;
  margin: .45rem 0;
}
.echo-row label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #4b5365;
}
.echo-row select,
.echo-row input[type="range"],
.echo-row input[type="password"],
.echo-row input[type="text"] {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  padding: .3rem .4rem;
  border: 1px solid #d8cdb6;
  background: #fff8e8;
  color: #0e1626;
  border-radius: 2px;
  width: 100%;
}
.echo-row input[type="range"] { padding: 0; height: 18px; }

.echo-foot {
  margin-top: .8rem;
  padding-top: .7rem;
  border-top: 1px dashed #d8cdb6;
  font-size: 11.5px;
  color: #4b5365;
  font-style: italic;
}
.echo-foot a { color: #b8651f; text-decoration: none; border-bottom: 1px solid transparent; }
.echo-foot a:hover { border-bottom-color: #b8651f; }

.echo-spoken {
  background: rgba(184, 101, 31, 0.08);
  border-left: 3px solid #b8651f;
  padding-left: .35rem;
  margin-left: -.35rem;
  transition: background .2s ease;
}

@media (max-width: 600px) {
  .echo-btn { font-size: 10px; padding: .5rem .7rem; }
  .echo-btn-label { display: none; }
  .echo-panel { width: calc(100vw - 24px); }
}

@media (prefers-reduced-motion: reduce) {
  .echo-btn.is-playing .dot { animation: none; }
}
`;

  const styleTag = document.createElement('style');
  styleTag.id = 'echo-style';
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  // ── settings storage ───────────────────────────────────────
  function loadSettings() {
    try {
      return Object.assign(
        { rate: 1.0, pitch: 1.0, voiceURI: '', useOpenAI: false, openaiVoice: 'echo' },
        JSON.parse(localStorage.getItem('echo_settings') || '{}')
      );
    } catch (_) {
      return { rate: 1.0, pitch: 1.0, voiceURI: '', useOpenAI: false, openaiVoice: 'echo' };
    }
  }
  function saveSettings(s) {
    try { localStorage.setItem('echo_settings', JSON.stringify(s)); } catch (_) {}
  }
  function getOpenAIKey() { try { return localStorage.getItem('openai_tts_key') || ''; } catch (_) { return ''; } }
  function setOpenAIKey(k) { try { localStorage.setItem('openai_tts_key', k || ''); } catch (_) {} }

  // ── DOM construction ───────────────────────────────────────
  const btn = document.createElement('button');
  btn.className = 'echo-btn';
  btn.setAttribute('aria-label', 'Listen to this page');
  btn.innerHTML = '<span class="dot"></span><span class="echo-btn-label">Listen</span>';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'echo-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Echo · voice settings');
  panel.innerHTML = `
    <div class="echo-panel-head">
      <span class="echo-panel-mark">Echo<i>/</i>voice</span>
      <button class="echo-panel-close" aria-label="Close">×</button>
    </div>
    <div class="echo-panel-body">
      <div class="echo-status" id="echo-status">Ready · ${'speechSynthesis' in window ? 'browser voice' : 'no TTS support'}</div>
      <div class="echo-controls">
        <button id="echo-play" class="is-primary" type="button">▶ Play</button>
        <button id="echo-pause" type="button">‖ Pause</button>
        <button id="echo-stop" type="button">■ Stop</button>
      </div>
      <div class="echo-progress" aria-hidden="true"><div class="echo-progress-bar" id="echo-progress"></div></div>

      <div class="echo-row">
        <label for="echo-voice">Voice</label>
        <select id="echo-voice"></select>
      </div>
      <div class="echo-row">
        <label for="echo-rate">Speed</label>
        <input id="echo-rate" type="range" min=".7" max="1.4" step=".05" value="1.0">
      </div>
      <div class="echo-row">
        <label for="echo-pitch">Pitch</label>
        <input id="echo-pitch" type="range" min=".8" max="1.2" step=".05" value="1.0">
      </div>
      <div class="echo-row">
        <label for="echo-engine">Engine</label>
        <select id="echo-engine">
          <option value="browser">Browser · free</option>
          <option value="openai">OpenAI TTS · BYOK</option>
        </select>
      </div>
      <div class="echo-row" id="echo-openai-row" style="display:none">
        <label for="echo-openai-voice">OpenAI voice</label>
        <select id="echo-openai-voice">
          <option value="echo">Echo (recommended)</option>
          <option value="alloy">Alloy</option>
          <option value="fable">Fable</option>
          <option value="nova">Nova</option>
          <option value="onyx">Onyx</option>
          <option value="shimmer">Shimmer</option>
        </select>
      </div>
      <div class="echo-row" id="echo-key-row" style="display:none">
        <label for="echo-key">API key</label>
        <input id="echo-key" type="password" placeholder="sk-..." autocomplete="off">
      </div>

      <div class="echo-foot">
        Echo is Stratum's voice agent. Your settings persist locally; your OpenAI key, if set, never leaves your browser.
        <br><a href="/stratum-chairman-briefing/agents/" tabindex="-1">Meet the agents →</a>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ── element refs ───────────────────────────────────────────
  const $ = (sel) => panel.querySelector(sel);
  const els = {
    close: panel.querySelector('.echo-panel-close'),
    status: $('#echo-status'),
    play: $('#echo-play'),
    pause: $('#echo-pause'),
    stop: $('#echo-stop'),
    progress: $('#echo-progress'),
    voiceSel: $('#echo-voice'),
    rateSlider: $('#echo-rate'),
    pitchSlider: $('#echo-pitch'),
    engineSel: $('#echo-engine'),
    openaiVoiceSel: $('#echo-openai-voice'),
    openaiRow: $('#echo-openai-row'),
    keyRow: $('#echo-key-row'),
    keyInput: $('#echo-key'),
  };

  // ── voice loading ──────────────────────────────────────────
  let voices = [];
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    // Rank: premium/enhanced English first, then English, then others
    const rank = (v) => {
      const name = v.name.toLowerCase();
      let score = 0;
      if (/premium|enhanced|neural|natural|siri/i.test(name)) score += 100;
      if (v.lang && v.lang.toLowerCase().startsWith('en')) score += 50;
      if (/(samantha|karen|daniel|fiona|aaron|nicky|alex|fred)/i.test(name)) score += 20;
      return -score;
    };
    voices.sort((a, b) => rank(a) - rank(b));
    els.voiceSel.innerHTML = voices.map(v => {
      return `<option value="${v.voiceURI}">${v.name} · ${v.lang}</option>`;
    }).join('');
    const settings = loadSettings();
    if (settings.voiceURI) els.voiceSel.value = settings.voiceURI;
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // ── settings sync ──────────────────────────────────────────
  function applySettings(s) {
    els.rateSlider.value = s.rate;
    els.pitchSlider.value = s.pitch;
    els.engineSel.value = s.useOpenAI ? 'openai' : 'browser';
    els.openaiVoiceSel.value = s.openaiVoice;
    if (s.useOpenAI) {
      els.openaiRow.style.display = '';
      els.keyRow.style.display = '';
      els.keyInput.value = getOpenAIKey();
    }
  }
  applySettings(loadSettings());

  function captureSettings() {
    const s = {
      rate: parseFloat(els.rateSlider.value),
      pitch: parseFloat(els.pitchSlider.value),
      voiceURI: els.voiceSel.value,
      useOpenAI: els.engineSel.value === 'openai',
      openaiVoice: els.openaiVoiceSel.value,
    };
    saveSettings(s);
    return s;
  }

  // ── text extraction ────────────────────────────────────────
  function extractChunks() {
    // Prefer <main>; fallback to <article>; fallback to body
    const root = document.querySelector('main') || document.querySelector('article') || document.body;
    // Build paragraph list while excluding chrome
    const skipSelectors = [
      '.echo-btn', '.echo-panel', '.rt-stamp', '.mob-bar', '.masthead-nav',
      '.quicknav', '.ticker', '.rn-banner', 'nav', 'footer', '.colophon',
      'script', 'style', 'noscript', 'svg', 'pre code',
    ];
    function skipped(el) {
      return skipSelectors.some(sel => el.closest(sel));
    }
    // Walk through h1-h6, p, li, blockquote
    const blocks = root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, .lede, .section-h, .section-dek, .rule-body, .answer-headline, .r-blurb');
    const chunks = [];
    blocks.forEach(el => {
      if (skipped(el)) return;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text || text.length < 4) return;
      chunks.push({ el, text });
    });
    // Dedup adjacent (some pages nest)
    const out = [];
    let lastText = '';
    chunks.forEach(c => {
      if (c.text === lastText) return;
      out.push(c);
      lastText = c.text;
    });
    return out;
  }

  // ── playback state ─────────────────────────────────────────
  const state = {
    chunks: [],
    index: 0,
    playing: false,
    paused: false,
    engine: 'browser', // or 'openai'
    audio: null,       // for openai
    abortKey: 0,       // increments on stop to invalidate in-flight openai requests
  };

  function setStatus(msg, kind) {
    els.status.innerHTML = (kind ? `<span class="${kind}">${msg}</span>` : msg);
  }
  function highlight(idx) {
    state.chunks.forEach(c => c.el.classList.remove('echo-spoken'));
    if (state.chunks[idx]) state.chunks[idx].el.classList.add('echo-spoken');
  }
  function updateProgress() {
    const pct = state.chunks.length ? (state.index / state.chunks.length) * 100 : 0;
    els.progress.style.width = pct + '%';
  }
  function setPlaying(p) {
    state.playing = p;
    btn.classList.toggle('is-playing', p);
    els.play.disabled = p && !state.paused;
    els.pause.disabled = !p;
    els.stop.disabled = !p;
  }

  // ── browser engine ─────────────────────────────────────────
  function playBrowser() {
    if (!('speechSynthesis' in window)) {
      setStatus('Browser TTS not supported', 'err');
      return;
    }
    if (state.chunks.length === 0) state.chunks = extractChunks();
    if (state.chunks.length === 0) { setStatus('No readable text found', 'warn'); return; }
    setPlaying(true);
    setStatus(`Playing · ${state.index + 1}/${state.chunks.length}`, 'ok');
    const settings = captureSettings();
    const speakOne = () => {
      if (!state.playing) return;
      if (state.index >= state.chunks.length) {
        stop();
        setStatus('Finished');
        return;
      }
      const chunk = state.chunks[state.index];
      highlight(state.index);
      updateProgress();
      const u = new SpeechSynthesisUtterance(chunk.text);
      u.rate = settings.rate;
      u.pitch = settings.pitch;
      const v = voices.find(v => v.voiceURI === settings.voiceURI) || voices[0];
      if (v) u.voice = v;
      u.onend = () => {
        if (!state.playing) return;
        state.index += 1;
        setStatus(`Playing · ${state.index + 1}/${state.chunks.length}`, 'ok');
        speakOne();
      };
      u.onerror = (e) => {
        if (e.error !== 'interrupted') setStatus('Speech error · ' + e.error, 'err');
      };
      window.speechSynthesis.speak(u);
    };
    speakOne();
  }
  function pauseBrowser() {
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    state.paused = true;
    setStatus('Paused', 'warn');
    btn.classList.remove('is-playing');
  }
  function resumeBrowser() {
    if ('speechSynthesis' in window) window.speechSynthesis.resume();
    state.paused = false;
    setStatus(`Playing · ${state.index + 1}/${state.chunks.length}`, 'ok');
    btn.classList.add('is-playing');
  }
  function stopBrowser() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ── OpenAI engine ──────────────────────────────────────────
  async function playOpenAI() {
    const key = getOpenAIKey();
    if (!key) { setStatus('Add OpenAI key', 'warn'); return; }
    if (state.chunks.length === 0) state.chunks = extractChunks();
    if (state.chunks.length === 0) { setStatus('No readable text found', 'warn'); return; }
    setPlaying(true);
    const settings = captureSettings();
    const myKey = ++state.abortKey;

    const speakOne = async () => {
      if (!state.playing || myKey !== state.abortKey) return;
      if (state.index >= state.chunks.length) {
        stop();
        setStatus('Finished');
        return;
      }
      const chunk = state.chunks[state.index];
      highlight(state.index);
      updateProgress();
      setStatus(`Streaming · ${state.index + 1}/${state.chunks.length}`, 'ok');
      try {
        const resp = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1-hd',
            voice: settings.openaiVoice,
            input: chunk.text.slice(0, 4000),
            speed: settings.rate,
          }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          setStatus('OpenAI error: ' + resp.status, 'err');
          console.error('Echo · OpenAI error:', err);
          stop();
          return;
        }
        const blob = await resp.blob();
        if (myKey !== state.abortKey) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        state.audio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (myKey !== state.abortKey || !state.playing) return;
          state.index += 1;
          speakOne();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setStatus('Audio playback failed', 'err');
          stop();
        };
        await audio.play();
      } catch (e) {
        setStatus('Network error', 'err');
        console.error('Echo · network error:', e);
        stop();
      }
    };
    speakOne();
  }
  function pauseOpenAI() {
    if (state.audio) state.audio.pause();
    state.paused = true;
    setStatus('Paused', 'warn');
    btn.classList.remove('is-playing');
  }
  function resumeOpenAI() {
    if (state.audio) state.audio.play();
    state.paused = false;
    setStatus(`Playing · ${state.index + 1}/${state.chunks.length}`, 'ok');
    btn.classList.add('is-playing');
  }
  function stopOpenAI() {
    state.abortKey += 1;
    if (state.audio) {
      state.audio.pause();
      state.audio = null;
    }
  }

  // ── unified controls ───────────────────────────────────────
  function play() {
    if (state.playing && state.paused) {
      // resume
      if (state.engine === 'openai') resumeOpenAI(); else resumeBrowser();
      return;
    }
    if (state.playing) return;
    const s = captureSettings();
    state.engine = s.useOpenAI ? 'openai' : 'browser';
    state.index = state.index || 0;
    if (state.engine === 'openai') playOpenAI(); else playBrowser();
  }
  function pause() {
    if (!state.playing || state.paused) return;
    if (state.engine === 'openai') pauseOpenAI(); else pauseBrowser();
  }
  function stop() {
    if (state.engine === 'openai') stopOpenAI(); else stopBrowser();
    setPlaying(false);
    state.paused = false;
    state.index = 0;
    state.chunks.forEach(c => c.el.classList.remove('echo-spoken'));
    updateProgress();
  }

  // ── wiring ─────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    if (panel.classList.contains('is-open')) {
      panel.classList.remove('is-open');
    } else {
      panel.classList.add('is-open');
    }
  });
  els.close.addEventListener('click', () => panel.classList.remove('is-open'));
  els.play.addEventListener('click', play);
  els.pause.addEventListener('click', pause);
  els.stop.addEventListener('click', stop);
  els.engineSel.addEventListener('change', () => {
    const useOpenAI = els.engineSel.value === 'openai';
    els.openaiRow.style.display = useOpenAI ? '' : 'none';
    els.keyRow.style.display = useOpenAI ? '' : 'none';
    if (useOpenAI) els.keyInput.value = getOpenAIKey();
    captureSettings();
  });
  els.keyInput.addEventListener('change', () => setOpenAIKey(els.keyInput.value.trim()));
  els.voiceSel.addEventListener('change', captureSettings);
  els.rateSlider.addEventListener('input', captureSettings);
  els.pitchSlider.addEventListener('input', captureSettings);
  els.openaiVoiceSel.addEventListener('change', captureSettings);

  // Stop playback if user navigates away
  window.addEventListener('beforeunload', stop);

  // Keyboard shortcut: Shift+L to toggle play/pause
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      if (!state.playing || state.paused) play(); else pause();
    }
  });

  // expose for debugging
  window.Echo = { play, pause, stop, state, settings: loadSettings, voices: () => voices };
})();
