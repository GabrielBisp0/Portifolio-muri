/* =========================================================
   Carrossel 3D curvo — JS puro, sem dependências.
   Funciona com qualquer elemento que tenha o atributo data-c3d.
   ========================================================= */
(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (v, fallback) => (v !== undefined && !isNaN(parseFloat(v)) ? parseFloat(v) : fallback);


  /* ---------------------------------------------------------
     YOUTUBE: link -> id, thumbnail e popup
     --------------------------------------------------------- */
  const ID_OK = /^[\w-]{11}$/;

  // aceita youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID, /live/ID ou só o ID
  function idYoutube(link) {
    if (!link) return null;
    link = String(link).trim();
    if (ID_OK.test(link)) return link;
    try {
      const u = new URL(link, location.href);
      const host = u.hostname.replace(/^(www|m|music)\./, '');
      let id = null;
      if (host === 'youtu.be') id = u.pathname.split('/')[1];
      else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
        id = u.searchParams.get('v') || (u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1];
      }
      return id && ID_OK.test(id) ? id : null;
    } catch (e) {
      return null;
    }
  }

  // início opcional: ...?t=90 ou ...&start=90 (segundos)
  function inicioYoutube(link) {
    const m = String(link).match(/[?&#](?:t|start)=(\d+)/);
    return m ? `&start=${m[1]}` : '';
  }

  // thumbnail: tenta a melhor qualidade e cai para as outras se não existir
  function colocarThumb(media, id) {
    const versoes = ['maxresdefault', 'hq720', 'hqdefault'];
    let i = 0;
    const img = new Image();
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    const tentar = () => { img.src = `https://i.ytimg.com/vi/${id}/${versoes[i]}.jpg`; };
    // o YouTube devolve uma imagem minúscula (120px) quando a versão não existe
    img.onload = () => { if (img.naturalWidth <= 120 && i < versoes.length - 1) { i++; tentar(); } };
    img.onerror = () => { if (i < versoes.length - 1) { i++; tentar(); } };
    tentar();
    media.prepend(img);
  }

  let modal = null;
  let modalAberto = false;
  let focoAnterior = null;

  function criarModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'c3d-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Reprodutor de vídeo');
    modal.innerHTML =
      '<div class="c3d-modal__fundo" data-fechar></div>' +
      '<div class="c3d-modal__caixa">' +
        '<button type="button" class="c3d-modal__fechar" data-fechar aria-label="Fechar vídeo">&times;</button>' +
        '<div class="c3d-modal__video"></div>' +
      '</div>';
    modal.addEventListener('click', e => { if (e.target.closest('[data-fechar]')) fecharVideo(); });
    // não deixa a página rolar por trás do popup
    modal.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    modal.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    // o popup vai direto no <body>: dentro do carrossel/rolagem ele ficaria preso nas transformações
    document.body.appendChild(modal);
    return modal;
  }

  function abrirVideo(card) {
    const id = card.dataset.ytId;
    if (!id) return;
    const m = criarModal();

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1${inicioYoutube(card.dataset.youtube)}`;
    iframe.title = card.dataset.titulo || card.querySelector('figcaption')?.textContent.trim() || 'Vídeo';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    m.querySelector('.c3d-modal__video').replaceChildren(iframe);

    focoAnterior = card;
    modalAberto = true;
    m.classList.add('is-aberto');
    document.documentElement.classList.add('c3d-travado');
    m.querySelector('.c3d-modal__fechar').focus({ preventScroll: true });
  }

  function fecharVideo() {
    if (!modalAberto) return;
    modalAberto = false;
    modal.classList.remove('is-aberto');
    document.documentElement.classList.remove('c3d-travado');
    modal.querySelector('.c3d-modal__video').replaceChildren();   // remove o iframe: o som para na hora
    focoAnterior?.focus?.({ preventScroll: true });
  }

  document.addEventListener('keydown', e => {
    if (!modalAberto) return;
    if (e.key === 'Escape') { e.preventDefault(); fecharVideo(); return; }
    if (e.key === 'Tab') { e.preventDefault(); modal.querySelector('.c3d-modal__fechar').focus(); return; }
    // setas/espaço/page up-down não rolam a página por trás
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) e.preventDefault();
  });

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

    // cards com data-youtube: thumbnail automática + botão de play + acessível pelo teclado
    cards.forEach(card => {
      if (!card.dataset.youtube) return;
      const id = idYoutube(card.dataset.youtube);
      if (!id) {
        console.warn('Carrossel: link do YouTube inválido:', card.dataset.youtube);
        card.removeAttribute('data-youtube');
        return;
      }
      card.dataset.ytId = id;

      const media = card.querySelector('.c3d__media');
      if (media) {
        if (!media.querySelector('img, video')) colocarThumb(media, id);   // se você já pôs uma <img>, ela é mantida
        const play = document.createElement('span');
        play.className = 'c3d__play';
        play.setAttribute('aria-hidden', 'true');
        media.appendChild(play);
      }

      const titulo = card.dataset.titulo || card.querySelector('figcaption')?.textContent.trim() || 'vídeo';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-haspopup', 'dialog');
      card.setAttribute('aria-label', 'Assistir: ' + titulo);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); abrirVideo(card); }
      });
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
        if (!hovering && !dragging && onScreen && !modalAberto && !document.hidden) next();
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

    // clique: depois de arrastar não faz nada; card com vídeo abre o popup;
    // card comum que está do lado vem para o centro
    stage.addEventListener('click', e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      const card = e.target.closest('.c3d__card');
      if (!card) return;
      if (card.dataset.ytId) {
        e.preventDefault();
        abrirVideo(card);
        return;
      }
      if (!card.classList.contains('is-active')) {
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