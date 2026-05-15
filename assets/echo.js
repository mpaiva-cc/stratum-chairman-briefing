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

  // ── local bootstrap (dev convenience) ──────────────────────
  // If a sibling file ./echo-key.json exists (gitignored, local-only),
  // seed the OpenAI key and default to the OpenAI engine. On the public
  // GitHub Pages deploy this file does not exist; the fetch 404s silently
  // and the widget falls back to manual BYOK paste as before.
  const echoScriptTag = document.querySelector('script[src*="echo.js"]');
  const echoBaseURL = echoScriptTag
    ? echoScriptTag.src.replace(/echo\.js(\?.*)?$/, '')
    : '';

  async function bootstrapLocalKey() {
    if (!echoBaseURL) return;
    try {
      const r = await fetch(echoBaseURL + 'echo-key.json', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !j.openai_key) return;
      // Only seed if user hasn't already set one
      if (!localStorage.getItem('openai_tts_key')) {
        localStorage.setItem('openai_tts_key', j.openai_key);
      }
      // Default to OpenAI engine if user hasn't picked yet
      let s = {};
      try { s = JSON.parse(localStorage.getItem('echo_settings') || '{}'); } catch (_) {}
      if (s.useOpenAI === undefined) {
        s.useOpenAI = true;
        if (!s.openaiVoice) s.openaiVoice = 'echo';
        localStorage.setItem('echo_settings', JSON.stringify(s));
      }
    } catch (_) { /* offline, blocked, or missing — silent */ }
  }

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

  // Run bootstrap async; re-apply settings + status when done so UI reflects
  // the seeded key (e.g. switches engine selector to OpenAI on first visit).
  bootstrapLocalKey().then(() => {
    applySettings(loadSettings());
    if (loadSettings().useOpenAI && getOpenAIKey()) {
      setStatus('Ready · OpenAI voice (auto-loaded)', 'ok');
    }
  });

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
    batches: [],       // grouped chunks for openai (one fetch = one batch)
    index: 0,          // current paragraph index (for highlight)
    batchIdx: 0,       // current batch index (for openai)
    playing: false,
    paused: false,
    engine: 'browser', // or 'openai'
    audio: null,       // for openai
    abortKey: 0,       // increments on stop to invalidate in-flight openai requests
  };

  // Group adjacent chunks into batches sized for a single OpenAI request.
  // OpenAI TTS accepts up to 4096 chars; we target ~3000 to leave headroom
  // for the JSON envelope and avoid sentence truncation.
  function groupIntoBatches(chunks) {
    const MAX = 3000;
    const batches = [];
    let cur = null;
    chunks.forEach((c, i) => {
      if (!cur) {
        cur = { text: c.text, firstIdx: i, lastIdx: i, indices: [i] };
      } else if (cur.text.length + c.text.length + 2 <= MAX) {
        cur.text += '\n\n' + c.text;
        cur.lastIdx = i;
        cur.indices.push(i);
      } else {
        batches.push(cur);
        cur = { text: c.text, firstIdx: i, lastIdx: i, indices: [i] };
      }
    });
    if (cur) batches.push(cur);
    return batches;
  }

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
  function highlightBatch(batch) {
    state.chunks.forEach(c => c.el.classList.remove('echo-spoken'));
    if (!batch) return;
    batch.indices.forEach(i => {
      if (state.chunks[i]) state.chunks[i].el.classList.add('echo-spoken');
    });
  }

  async function fetchBatchAudio(batch, settings, key, abortKey) {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: settings.openaiVoice,
        input: batch.text,
        speed: settings.rate,
      }),
    });
    if (abortKey !== state.abortKey) {
      const err = new Error('aborted'); err.aborted = true; throw err;
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('Echo · OpenAI ' + resp.status + ':', errText);
      throw new Error('OpenAI ' + resp.status);
    }
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }

  async function playOpenAI() {
    const key = getOpenAIKey();
    if (!key) { setStatus('Add OpenAI key', 'warn'); return; }
    if (state.chunks.length === 0) state.chunks = extractChunks();
    if (state.chunks.length === 0) { setStatus('No readable text found', 'warn'); return; }
    if (state.batches.length === 0) state.batches = groupIntoBatches(state.chunks);

    setPlaying(true);
    const settings = captureSettings();
    const myKey = ++state.abortKey;

    let i = state.batchIdx || 0;
    const total = state.batches.length;
    setStatus(`Loading · 1/${total}`, 'ok');

    // Kick off first fetch immediately; pre-fetch each next batch while current plays.
    let currentPromise = fetchBatchAudio(state.batches[i], settings, key, myKey);
    let nextPromise = null;

    while (state.playing && myKey === state.abortKey && i < total) {
      // Pre-fetch the next batch in parallel with current playback
      if (i + 1 < total) {
        nextPromise = fetchBatchAudio(state.batches[i + 1], settings, key, myKey)
          .catch(e => { if (!e.aborted) console.error('Echo · prefetch failed:', e); return null; });
      } else {
        nextPromise = null;
      }

      let url;
      try {
        url = await currentPromise;
        if (!url) throw new Error('pre-fetch failed');
      } catch (e) {
        if (e.aborted) return;
        // Retry once inline before giving up on this batch
        try {
          url = await fetchBatchAudio(state.batches[i], settings, key, myKey);
        } catch (e2) {
          if (e2.aborted) return;
          setStatus(e2.message || 'OpenAI error', 'err');
          stop();
          return;
        }
      }
      if (!state.playing || myKey !== state.abortKey) {
        if (url) URL.revokeObjectURL(url);
        return;
      }

      const batch = state.batches[i];
      state.batchIdx = i;
      state.index = batch.firstIdx;
      highlightBatch(batch);
      updateProgress();
      setStatus(`Playing · ${i + 1}/${total}`, 'ok');

      const audio = new Audio(url);
      state.audio = audio;

      try {
        // Pause is handled implicitly: state.audio.pause()/play() are wired
        // up by pauseOpenAI/resumeOpenAI; the 'ended' event only fires once
        // playback truly completes, so this await naturally waits across pauses.
        await new Promise((resolve, reject) => {
          audio.addEventListener('ended', resolve, { once: true });
          audio.addEventListener('error', () => reject(new Error('audio playback failed')), { once: true });
          audio.play().catch(reject);
        });
      } catch (e) {
        URL.revokeObjectURL(url);
        if (myKey !== state.abortKey) return;
        if (state.playing) {
          console.error('Echo · batch ' + (i + 1) + ' playback error:', e);
          setStatus('Skipped batch ' + (i + 1), 'warn');
        }
      }

      URL.revokeObjectURL(url);
      i += 1;
      currentPromise = nextPromise;
    }

    if (state.playing && myKey === state.abortKey) {
      stop();
      setStatus('Finished');
    }
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
    state.batchIdx = 0;
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
