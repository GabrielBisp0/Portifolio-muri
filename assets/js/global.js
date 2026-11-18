/* =========================================================
   rolagem.js
   1) Carrega os HTMLs de /secoes e injeta direto no index
   2) Rolagem com inércia (suave) + efeitos por elemento
   ========================================================= */
(() => {
  'use strict';

  const reduzirMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mouseFino = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Elementos que recebem o efeito (os mesmos do seu código + atributos opcionais)
  const SELETOR = 'section, .card, svg, i, img, [data-parallax], [data-girar], [data-revelar]';

  const num = (v, padrao) => (v !== undefined && !isNaN(parseFloat(v)) ? parseFloat(v) : padrao);
  const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
  const suavizar = t => t * t * (3 - 2 * t);          // smoothstep
  const saidaSuave = t => 1 - Math.pow(1 - t, 3);     // easeOutCubic

  /* ---------------------------------------------------------
     1) CARREGAR SEÇÕES
     Todas em paralelo (mais rápido) e mantendo a ordem.
     O <div data-incluir> é SUBSTITUÍDO pelo conteúdo, então
     as <section> viram filhas diretas do index, sem wrapper.
     --------------------------------------------------------- */
  async function carregarSecoes() {
    const blocos = [...document.querySelectorAll('[data-incluir]')];

    const textos = await Promise.all(blocos.map(async bloco => {
      const arquivo = bloco.dataset.incluir;
      try {
        const resposta = await fetch(arquivo);
        if (!resposta.ok) throw new Error(resposta.status);
        return await resposta.text();
      } catch (erro) {
        console.warn(`Não foi possível carregar "${arquivo}":`, erro);
        return '';
      }
    }));

    blocos.forEach((bloco, i) => {
      const modelo = document.createElement('template');
      modelo.innerHTML = textos[i];
      const nos = [...modelo.content.childNodes];
      bloco.replaceWith(modelo.content);

      // <script> inserido via innerHTML não executa: recria para funcionar
      nos.forEach(no => {
        if (no.nodeType !== 1) return;
        const scripts = no.matches('script') ? [no] : [...no.querySelectorAll('script')];
        scripts.forEach(antigo => {
          const novo = document.createElement('script');
          [...antigo.attributes].forEach(a => novo.setAttribute(a.name, a.value));
          novo.textContent = antigo.textContent;
          antigo.replaceWith(novo);
        });
      });
    });
  }

  /* ---------------------------------------------------------
     2) ROLAGEM + EFEITOS
     --------------------------------------------------------- */
  function iniciarRolagem() {
    const raiz = document.querySelector('[data-rolagem]') || document.body;
    const html = document.documentElement;

    // Rolagem com inércia só com mouse e só se existir [data-rolagem].
    // No celular o scroll nativo já tem inércia; os efeitos funcionam igual.
    const suave = !!document.querySelector('[data-rolagem]') && mouseFino && !reduzirMovimento;
    const fluidez = num(raiz.dataset.fluidez, 7);   // maior = mais "colado" no scroll

    if (suave) html.classList.add('rolagem-suave');

    // Quem recebe efeito: tudo dentro da raiz, exceto o que estiver em [data-sem-efeito]
    const elementos = reduzirMovimento
      ? []
      : [...raiz.querySelectorAll(SELETOR)].filter(el => {
          if (el.closest('[data-sem-efeito]')) return false;
          // dentro de um carrossel 3D os elementos têm transform próprio: não mexe
          const carrossel = el.closest('[data-c3d]');
          return !carrossel || carrossel === el;
        });

    // Cascata: irmãos entram um depois do outro (seções não entram nessa conta)
    const contagem = new Map();
    const itens = elementos.map(el => {
      const ehSecao = el.matches('section');
      const pos = contagem.get(el.parentElement) || 0;
      if (!ehSecao) contagem.set(el.parentElement, pos + 1);
      el.classList.add('efeito');
      return {
        el,
        atraso: ehSecao ? 0 : Math.min(pos, 6) * 0.07,
        parallax: num(el.dataset.parallax, 0),   // ex.: 0.15 = anda mais rápido que a página
        girar: num(el.dataset.girar, 0),         // ex.: -8 = graus de giro ao cruzar a tela
        top: 0,
        altura: 0,
      };
    });

    let vh = innerHeight;
    let y = scrollY;          // posição suavizada
    let rodando = false;
    let ultimo = 0;

    /* ---- medir posições (com transforms zerados) ---- */
    function medir() {
      vh = innerHeight;
      html.classList.add('medindo');
      const guardado = raiz.style.transform;
      if (suave) raiz.style.transform = 'none';
      const base = suave ? 0 : scrollY;

      for (const it of itens) {
        const r = it.el.getBoundingClientRect();
        it.top = r.top + base;
        it.altura = r.height;
      }

      html.classList.remove('medindo');
      if (suave) {
        raiz.style.transform = guardado;
        document.body.style.height = raiz.offsetHeight + 'px';   // cria a barra de rolagem real
      }
      pedir();
    }

    /* ---- aplicar efeitos ---- */
    function aplicar() {
      if (suave) raiz.style.transform = `translate3d(0, ${(-y).toFixed(2)}px, 0)`;

      for (const it of itens) {
        const topo = it.top - y;
        const base = topo + it.altura;
        if (base < -200 || topo > vh + 200) continue;   // longe da tela: nem calcula

        // 0→1 enquanto o elemento sobe da parte de baixo da tela
        const entrada = limitar((vh - topo) / (vh * 0.4) - it.atraso, 0, 1);
        // 1→0 enquanto o elemento termina de sair pelo topo
        const saida = limitar(base / (vh * 0.25), 0, 1);

        const d = (topo + it.altura / 2 - vh / 2) / vh;   // -1 (em cima) … +1 (embaixo)

        const opacidade = suavizar(Math.min(entrada, saida));
        const deslocamento =
          (1 - saidaSuave(entrada)) * 70 +      // sobe de baixo
          -(1 - saida) * 24 +                   // sai um pouco mais rápido
          d * vh * it.parallax;                 // parallax opcional
        const escala = 1 - (1 - saida) * 0.06 - (1 - entrada) * 0.04;
        const giro = d * it.girar;

        const s = it.el.style;
        s.setProperty('--visibilidade', opacidade.toFixed(3));
        s.setProperty('--deslocamento', deslocamento.toFixed(2));
        s.setProperty('--escala', escala.toFixed(4));
        s.setProperty('--giro', giro.toFixed(2));
      }
    }

    /* ---- loop (só roda enquanto há movimento) ---- */
    function passo(t) {
      const dt = Math.min(0.05, (t - ultimo) / 1000);
      ultimo = t;
      const alvo = scrollY;

      if (suave) {
        const diff = alvo - y;
        y = Math.abs(diff) < 0.1 ? alvo : y + diff * (1 - Math.exp(-dt * fluidez));
      } else {
        y = alvo;
      }

      aplicar();

      if (suave && y !== alvo) requestAnimationFrame(passo);
      else rodando = false;
    }

    function pedir() {
      if (rodando) return;
      rodando = true;
      ultimo = performance.now();
      requestAnimationFrame(passo);
    }

    /* ---- links internos (#servicos) rolam suavemente ---- */
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#"]');
      if (!link || link.getAttribute('href') === '#') return;
      const destino = document.querySelector(link.getAttribute('href'));
      if (!destino) return;
      e.preventDefault();

      const guardado = raiz.style.transform;
      if (suave) raiz.style.transform = 'none';
      html.classList.add('medindo');
      const topo = destino.getBoundingClientRect().top + (suave ? 0 : scrollY);
      html.classList.remove('medindo');
      if (suave) raiz.style.transform = guardado;

      scrollTo({ top: topo, behavior: reduzirMovimento ? 'auto' : 'smooth' });
    });

    /* ---- eventos ---- */
    addEventListener('scroll', pedir, { passive: true });
    addEventListener('resize', medir);
    addEventListener('load', medir);
    document.fonts?.ready.then(medir);
    if ('ResizeObserver' in window) new ResizeObserver(medir).observe(raiz);  // imagens carregando etc.

    medir();
    y = scrollY;
    aplicar();
    html.classList.add('pronto');   // faz a página entrar com fade
  }

  /* ---------------------------------------------------------
     INÍCIO
     --------------------------------------------------------- */
  carregarSecoes().then(() => {
    // Avisa scripts de componentes (ex.: carrossel 3D) que o conteúdo já está no index
    document.dispatchEvent(new Event('secoes-carregadas'));
    iniciarRolagem();
  });
})();