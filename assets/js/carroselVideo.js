/* =========================================================
   Carrossel 3D curvo — JS puro, sem dependências.
   Funciona com qualquer elemento que tenha o atributo data-c3d.
   ========================================================= */
(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (v, fallback) => (v !== undefined && !isNaN(parseFloat(v)) ? parseFloat(v) : fallback);

  // Inicia todos os carrosséis que ainda não foram iniciados.
  // Roda agora, de novo quando o rolagem.js terminar de injetar as seções
  // (evento "secoes-carregadas") e pode ser chamado à mão: iniciarCarrossel3D()
  function iniciarTodos() {
    document.querySelectorAll('[data-c3d]').forEach(init);
  }
  window.iniciarCarrossel3D = iniciarTodos;
  document.addEventListener('secoes-carregadas', iniciarTodos);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarTodos);
  else iniciarTodos();

  function init(root) {
    const stage = root.querySelector('.c3d__stage');
    const cards = [...root.querySelectorAll('.c3d__card')];
    const thumb = root.querySelector('.c3d__thumb');
    const n = cards.length;
    if (!stage || n < 2 || root.dataset.c3dPronto) return;
    root.dataset.c3dPronto = '1';   // evita iniciar duas vezes

    // vídeos: garante mudo + inline (obrigatório para tocar sozinho)
    root.querySelectorAll('video').forEach(v => {
      v.muted = true;
      v.playsInline = true;
    });

    const cfg = {
      spacing: num(root.dataset.spacing, 1.16),
      tilt: num(root.dataset.tilt, 9),
      depth: num(root.dataset.depth, 14),
      visible: num(root.dataset.visible, 3),
      interval: num(root.dataset.interval, 2600),
      autoplay: root.dataset.autoplay !== 'false' && !reduceMotion,
    };

    let pos = 0;        // posição atual (fracionária, é ela que anima)
    let target = 0;     // posição de destino
    let raf = 0, last = 0, timer = 0;
    let hovering = false, onScreen = true;
    let dragging = false, moved = false, startX = 0, startTarget = 0, downCard = null;

    // distância circular de um card até a posição atual: de -n/2 a +n/2
    const wrap = v => ((v + n / 2) % n + n) % n - n / 2;

    /* ---------- desenho ---------- */
    function render() {
      const step = cards[0].offsetWidth * cfg.spacing;

      cards.forEach((card, i) => {
        const o = wrap(i - pos);          // posição relativa ao centro
        const a = Math.abs(o);
        const fade = Math.min(1, Math.max(0, cfg.visible + 0.6 - a));

        // curva côncava: bordas viram para o centro e avançam um pouco
        card.style.transform =
          `translate(-50%, -50%) translate3d(${o * step}px, 0, ${a * a * cfg.depth}px) rotateY(${-o * cfg.tilt}deg)`;
        card.style.opacity = fade;
        card.style.visibility = fade === 0 ? 'hidden' : 'visible';

        // só toca o vídeo dos cards visíveis (economiza processamento)
        const aparece = fade > 0;
        if (card._aparece !== aparece) {
          card._aparece = aparece;
          card.querySelectorAll('video').forEach(v => (aparece ? v.play().catch(() => {}) : v.pause()));
        }
        card.style.zIndex = 100 - Math.round(a * 10);

        const active = a < 0.5;
        card.classList.toggle('is-active', active);
        if (active) card.setAttribute('aria-current', 'true');
        else card.removeAttribute('aria-current');
      });

      if (thumb) {
        const p = (((pos % n) + n) % n) / n;
        const w = parseFloat(getComputedStyle(thumb).width) / thumb.parentElement.offsetWidth * 100;
        thumb.style.left = p * (100 - w) + '%';
      }
    }

    /* ---------- animação suave até o destino ---------- */
    function tick(t) {
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      const d = target - pos;
      if (Math.abs(d) < 0.0005) {
        pos = target;
        render();
        raf = 0;
        return;
      }
      pos += d * (1 - Math.exp(-dt * 6));   // maior que 6 = mais rápido
      render();
      raf = requestAnimationFrame(tick);
    }

    function go(to) {
      target = to;
      if (reduceMotion) { pos = target; render(); return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    const next = () => go(Math.round(target) + 1);
    const prev = () => go(Math.round(target) - 1);

    /* ---------- autoplay ---------- */
    function play() {
      clearInterval(timer);
      if (!cfg.autoplay) return;
      timer = setInterval(() => {
        if (!hovering && !dragging && onScreen && !document.hidden) next();
      }, cfg.interval);
    }

    root.addEventListener('pointerenter', () => (hovering = true));
    root.addEventListener('pointerleave', () => (hovering = false));
    root.addEventListener('focusin', () => (hovering = true));
    root.addEventListener('focusout', () => (hovering = false));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => (onScreen = e.isIntersecting), { threshold: 0.2 }).observe(root);
    }

    /* ---------- setas e teclado ---------- */
    root.querySelector('[data-c3d-next]')?.addEventListener('click', next);
    root.querySelector('[data-c3d-prev]')?.addEventListener('click', prev);

    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    });

    /* ---------- arrastar (mouse e touch) ---------- */
    stage.addEventListener('pointerdown', e => {
      if (e.button) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startTarget = target;
      downCard = e.target.closest('.c3d__card');
    });

    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-dragging');
      }
      if (moved) go(startTarget - dx / (cards[0].offsetWidth * cfg.spacing));
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      if (moved) go(Math.round(target));   // encaixa no card mais próximo
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // clique: depois de arrastar, não dispara links; num card lateral, traz ele pro centro
    stage.addEventListener('click', e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      const card = e.target.closest('.c3d__card');
      if (card && !card.classList.contains('is-active')) {
        e.preventDefault();
        go(target + wrap(cards.indexOf(card) - target));
      }
    }, true);

    // evita arrastar imagens/links nativamente
    stage.addEventListener('dragstart', e => e.preventDefault());

    /* ---------- início ---------- */
    if ('ResizeObserver' in window) new ResizeObserver(render).observe(stage);
    else addEventListener('resize', render);

    render();
    play();
  }
})();