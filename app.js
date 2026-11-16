// app.js: liga a tela, os arquivos e a voz.
// Fluxo: abrir arquivo -> "fonte" (sabe entregar o texto de cada página)
// -> página vira palavras (texto.js) -> a voz fala frase por frase e
// avisa em qual letra está; a gente pinta a palavra correspondente.
// As páginas aparecem uma embaixo da outra (rolagem contínua).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const tela = {
    entrada: $('entrada'), exemplo: $('exemplo'), leitura: $('leitura'), status: $('status'),
    tocar: $('tocar'), pagAnt: $('pagAnt'), pagProx: $('pagProx'), paginaInfo: $('paginaInfo'),
    voz: $('voz'), velocidade: $('velocidade'), velValor: $('velValor'),
    fonteMenos: $('fonteMenos'), fonteMais: $('fonteMais'), tema: $('tema'), soltar: $('soltar'),
    voltar: $('voltar'),
  };

  // ---------- preferências (guardadas só neste navegador) ----------
  function ler(chave, padrao) {
    try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v); }
    catch { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado: ignora */ }
  }
  const prefs = Object.assign({ voz: '', velocidade: 1, fonte: 1.25, tema: 'claro' }, ler('leitor:prefs', {}));
  const salvarPrefs = () => gravar('leitor:prefs', prefs);

  // ---------- estado ----------
  const estado = {
    fonte: null,        // { nome, chave, total, obterPagina(n) }
    paginas: [],        // promessas das páginas já preparadas (cache)
    prontas: [],        // páginas já prontas (para uso imediato)
    secoes: [],         // elemento <section> de cada página desenhada
    spans: [],          // spans[pagina][palavra]
    primeira: 0,        // primeira página desenhada
    ultima: -1,         // última página desenhada
    atual: 0,           // página que está sendo lida
    pos: 0,             // palavra atual (índice na página)
    lendo: false,
    geracao: 0,         // cada fala nova ganha um número; falas antigas são ignoradas
    frase: [],
    recebeuPalavra: false,
    seguir: true,       // a tela acompanha a leitura? (desliga quando você rola)
    autoRolando: false,
  };

  const status = msg => { tela.status.textContent = msg || ''; };

  // ---------- tema e tamanho da letra ----------
  function aplicarVisual() {
    document.documentElement.dataset.tema = prefs.tema;
    tela.tema.textContent = prefs.tema === 'escuro' ? '☀️' : '🌙';
    document.documentElement.style.setProperty('--fonte-leitura', prefs.fonte + 'rem');
  }
  tela.tema.onclick = () => { prefs.tema = prefs.tema === 'escuro' ? 'claro' : 'escuro'; aplicarVisual(); salvarPrefs(); };
  tela.fonteMais.onclick = () => { prefs.fonte = Math.min(2.2, +(prefs.fonte + 0.1).toFixed(2)); aplicarVisual(); salvarPrefs(); };
  tela.fonteMenos.onclick = () => { prefs.fonte = Math.max(0.9, +(prefs.fonte - 0.1).toFixed(2)); aplicarVisual(); salvarPrefs(); };

  // ---------- vozes ----------
  const sintese = window.speechSynthesis;
  let vozes = [];
  function carregarVozes() {
    if (!sintese) return;
    const todas = sintese.getVoices();
    if (!todas.length) return;
    // Português primeiro (Brasil antes de Portugal), depois o resto
    const nota = v => (v.lang === 'pt-BR' ? 0 : v.lang.startsWith('pt') ? 1 : 2);
    vozes = todas.slice().sort((a, b) => nota(a) - nota(b) || a.name.localeCompare(b.name));
    tela.voz.innerHTML = '';
    for (const v of vozes) {
      const op = document.createElement('option');
      op.value = v.name;
      op.textContent = `${v.name.replace(/^Microsoft /, '')} (${v.lang})`;
      tela.voz.appendChild(op);
    }
    const escolhida = vozes.find(v => v.name === prefs.voz) || vozes[0];
    tela.voz.value = escolhida.name;
  }
  if (sintese) {
    carregarVozes();
    sintese.addEventListener('voiceschanged', carregarVozes);
  } else {
    status('Este navegador não tem leitura em voz alta. Use o Chrome ou o Edge.');
  }
  tela.voz.onchange = () => { prefs.voz = tela.voz.value; salvarPrefs(); reiniciarSeLendo(); };
  tela.velocidade.value = prefs.velocidade;
  const mostrarVel = () => { tela.velValor.textContent = (+tela.velocidade.value).toFixed(1) + 'x'; };
  mostrarVel();
  tela.velocidade.oninput = mostrarVel;
  tela.velocidade.onchange = () => { prefs.velocidade = +tela.velocidade.value; salvarPrefs(); reiniciarSeLendo(); };

  // ---------- fontes de texto (PDF, imagens, .txt) ----------
  let ocrTrabalhador = null;
  async function ocr(imagem, rotulo) {
    if (!window.Tesseract) throw new Error('não consegui carregar o leitor de imagens (sem internet?)');
    if (!ocrTrabalhador) {
      status('Preparando o leitor de imagens (só na 1ª vez demora um pouco)...');
      ocrTrabalhador = Tesseract.createWorker('por', 1, {
        logger: m => { if (m.status === 'recognizing text') status(`${rotulo}: lendo a imagem ${Math.round(m.progress * 100)}%`); },
      });
    }
    const { data } = await (await ocrTrabalhador).recognize(imagem);
    status('');
    return data.text;
  }

  async function fonteDePdf(arquivo) {
    if (!window.pdfjsLib) throw new Error('não consegui carregar o leitor de PDF (sem internet?)');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    return {
      total: pdf.numPages,
      async obterPagina(n) {
        const pagina = await pdf.getPage(n + 1);
        const conteudo = await pagina.getTextContent();
        const linhas = Texto.linhasDoPdf(conteudo.items);
        if (linhas.join('').replace(/\s/g, '').length >= 20) return Texto.paragrafosDeLinhas(linhas);
        // Página sem texto (escaneada ou capa): desenha e passa pelo OCR
        const vista = pagina.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vista.width; canvas.height = vista.height;
        await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vista }).promise;
        return Texto.paragrafosDeLinhas((await ocr(canvas, `Página ${n + 1}`)).split('\n'));
      },
    };
  }

  function fonteDeImagens(arquivos) {
    return {
      total: arquivos.length,
      async obterPagina(n) {
        return Texto.paragrafosDeLinhas((await ocr(arquivos[n], arquivos[n].name)).split('\n'));
      },
    };
  }

  function fonteDeTexto(texto) {
    const paginas = Texto.dividirEmPaginas(Texto.paragrafosDeLinhas(texto.split(/\r?\n/)));
    return { total: paginas.length, obterPagina: async n => paginas[n] };
  }

  async function abrirArquivos(lista) {
    const arquivos = Array.from(lista || []);
    if (!arquivos.length) return;
    parar();
    const primeiro = arquivos[0];
    const nome = primeiro.name.toLowerCase();
    let fonte;
    try {
      status(`Abrindo ${primeiro.name}...`);
      if (nome.endsWith('.pdf') || primeiro.type === 'application/pdf') {
        fonte = await fonteDePdf(primeiro);
      } else if (nome.endsWith('.txt') || primeiro.type.startsWith('text/')) {
        fonte = fonteDeTexto(await primeiro.text());
      } else {
        const imagens = arquivos.filter(a => a.type.startsWith('image/'));
        if (!imagens.length) throw new Error('formato não suportado (use PDF, imagem ou .txt)');
        imagens.sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }));
        fonte = fonteDeImagens(imagens);
      }
    } catch (e) {
      status('Não deu para abrir: ' + e.message);
      return;
    }
    const titulo = arquivos.length > 1 && !nome.endsWith('.pdf') ? `${arquivos.length} imagens` : primeiro.name;
    iniciar(Object.assign(fonte, { nome: titulo, chave: `leitor:marca:${primeiro.name}:${primeiro.size}` }));
  }

  async function iniciar(fonte) {
    estado.fonte = fonte;
    estado.paginas = new Array(fonte.total).fill(null);
    estado.prontas = new Array(fonte.total).fill(null);
    const marca = ler(fonte.chave, null);
    const pagina = marca && marca.pagina < fonte.total ? marca.pagina : 0;
    await irParaPagina(pagina, marca ? marca.palavra : 0);
    status(marca && (marca.pagina || marca.palavra)
      ? `${fonte.nome}: continuando de onde você parou (página ${pagina + 1} de ${fonte.total}).`
      : `${fonte.nome} aberto (${fonte.total} ${fonte.total === 1 ? 'página' : 'páginas'}). Aperte ▶ ou clique numa palavra.`);
  }

  // ---------- desenhar as páginas ----------
  // Guarda a PROMESSA da página: se duas partes pedirem a mesma página ao mesmo tempo,
  // o trabalho (que pode ser um OCR demorado) é feito uma vez só.
  function prepararPagina(n) {
    if (!estado.paginas[n]) {
      const fonte = estado.fonte;
      estado.paginas[n] = fonte.obterPagina(n).then(paragrafos => {
        const pagina = Texto.montarPagina(paragrafos);
        if (estado.fonte === fonte) estado.prontas[n] = pagina;
        return pagina;
      }).catch(e => {
        if (estado.fonte === fonte) estado.paginas[n] = null; // deixa tentar de novo depois
        throw e;
      });
    }
    return estado.paginas[n];
  }

  function desenharSecao(n, pagina) {
    const secao = document.createElement('section');
    secao.className = 'pagina';
    secao.dataset.pag = n;
    const h = document.createElement('h2');
    h.textContent = `Página ${n + 1} de ${estado.fonte.total}`;
    secao.appendChild(h);
    const spans = [];
    for (const [ini, fim] of pagina.blocos) {
      const p = document.createElement('p');
      for (let i = ini; i <= fim; i++) {
        const s = document.createElement('span');
        s.className = 'pal';
        s.dataset.i = i;
        s.textContent = pagina.palavras[i];   // textContent: texto do arquivo nunca vira HTML
        spans[i] = s;
        p.appendChild(s);
        if (i < fim) p.appendChild(document.createTextNode(' '));
      }
      secao.appendChild(p);
    }
    if (!pagina.blocos.length) {
      const p = document.createElement('p');
      p.className = 'sem-texto';
      p.textContent = '(página sem texto)';
      secao.appendChild(p);
    }
    estado.spans[n] = spans;
    estado.secoes[n] = secao;
    return secao;
  }

  // Começa a tela de novo a partir da página n (botões ⏮ ⏭, abrir arquivo, marcador)
  async function irParaPagina(n, posicao = 0) {
    if (!estado.fonte || n < 0 || n >= estado.fonte.total) return false;
    const fonte = estado.fonte;
    tela.leitura.setAttribute('aria-busy', 'true');
    let pagina;
    try {
      pagina = await prepararPagina(n);
    } catch (e) {
      status(`Erro na página ${n + 1}: ${e.message}`);
      tela.leitura.removeAttribute('aria-busy');
      return false;
    }
    if (estado.fonte !== fonte) return false;   // abriram outro arquivo no meio
    estado.secoes = []; estado.spans = []; estado.frase = [];
    estado.primeira = n; estado.ultima = n;
    estado.atual = n;
    estado.pos = Math.min(posicao, Math.max(0, pagina.palavras.length - 1));
    tela.leitura.replaceChildren(desenharSecao(n, pagina), sentinela);
    tela.leitura.removeAttribute('aria-busy');
    atualizarBotoes();
    estado.seguir = true;
    tela.voltar.hidden = true;
    if (posicao > 0) destacar(estado.pos, true);
    else rolarAte(0);
    preencherTela();
    return true;
  }

  // Coloca a próxima página embaixo das que já estão na tela
  let anexando = null;
  function anexarProxima() {
    if (anexando) return anexando;
    if (!estado.fonte || estado.ultima + 1 >= estado.fonte.total) return Promise.resolve(false);
    const fonte = estado.fonte;
    const n = estado.ultima + 1;
    anexando = prepararPagina(n).then(pagina => {
      if (estado.fonte !== fonte || estado.ultima + 1 !== n) return false;
      tela.leitura.insertBefore(desenharSecao(n, pagina), sentinela);
      estado.ultima = n;
      return true;
    }).catch(e => {
      status(`Erro na página ${n + 1}: ${e.message}`);
      return false;
    }).finally(() => { anexando = null; });
    return anexando;
  }

  // Enche a tela: vai colocando páginas até passar um pouco do fim da janela
  async function preencherTela() {
    const fonte = estado.fonte;
    while (estado.fonte === fonte && sentinela.getBoundingClientRect().top < window.innerHeight * 2) {
      if (!(await anexarProxima())) break;
    }
  }

  // Um marcador invisível no fim do texto: quando ele chega perto da tela, carrega mais
  const sentinela = document.createElement('div');
  sentinela.className = 'sentinela';
  new IntersectionObserver(entradas => {
    if (entradas[0].isIntersecting) preencherTela();
  }, { rootMargin: '1200px 0px' }).observe(sentinela);

  function atualizarBotoes() {
    const total = estado.fonte ? estado.fonte.total : 0;
    tela.paginaInfo.textContent = `Página ${total ? estado.atual + 1 : 0} de ${total}`;
    tela.pagAnt.disabled = !total || estado.atual === 0;
    tela.pagProx.disabled = !total || estado.atual >= total - 1;
    tela.tocar.disabled = !total;
    tela.tocar.textContent = estado.lendo ? '⏸' : '▶';
    tela.tocar.setAttribute('aria-label', estado.lendo ? 'Pausar' : 'Ler');
  }

  // ---------- rolagem: a tela segue a leitura, mas você pode rolar livre ----------
  function rolarAte(y, el) {
    estado.autoRolando = true;
    clearTimeout(rolarAte.t);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else window.scrollTo({ top: y });
    // Fim da rolagem automática: evento scrollend (navegadores novos) ou tempo limite
    rolarAte.t = setTimeout(() => { estado.autoRolando = false; }, 1200);
  }
  window.addEventListener('scrollend', () => {
    clearTimeout(rolarAte.t);
    rolarAte.t = setTimeout(() => { estado.autoRolando = false; }, 50);
  });

  function soltarDaLeitura() {
    if (!estado.lendo || !estado.seguir) return;
    estado.seguir = false;
    tela.voltar.hidden = false;
  }
  // Qualquer rolagem feita por você (roda do mouse, dedo, teclado, barra de rolagem)
  window.addEventListener('wheel', soltarDaLeitura, { passive: true });
  window.addEventListener('touchmove', soltarDaLeitura, { passive: true });
  window.addEventListener('scroll', () => { if (!estado.autoRolando) soltarDaLeitura(); }, { passive: true });

  tela.voltar.onclick = () => {
    estado.seguir = true;
    tela.voltar.hidden = true;
    const s = spanAtual();
    if (s) rolarAte(0, s);
  };

  const spanAtual = () => (estado.spans[estado.atual] || [])[estado.pos];

  function destacar(i, forcarRolagem) {
    const antigo = tela.leitura.querySelector('.pal.lendo');
    if (antigo) antigo.classList.remove('lendo');
    estado.pos = i;
    const s = spanAtual();
    if (!s) return;
    s.classList.add('lendo');
    if (estado.seguir || forcarRolagem) {
      const r = s.getBoundingClientRect();
      const barra = document.querySelector('.controles').getBoundingClientRect().bottom;
      if (forcarRolagem || r.top < barra + 10 || r.bottom > window.innerHeight - 40) rolarAte(0, s);
    }
    if (estado.fonte) gravar(estado.fonte.chave, { pagina: estado.atual, palavra: i });
  }

  function marcarFrase(ini, fim) {
    for (const s of estado.frase) s.classList.remove('na-frase');
    estado.frase = (estado.spans[estado.atual] || []).slice(ini, fim + 1).filter(Boolean);
    for (const s of estado.frase) s.classList.add('na-frase');
  }

  // ---------- voz ----------
  async function falarDe(i) {
    if (!estado.lendo) return;
    const pagina = estado.prontas[estado.atual];
    if (!pagina || i >= pagina.palavras.length) {
      // Acabou a página: segue para a próxima (já está na tela ou é carregada agora)
      if (estado.atual + 1 >= estado.fonte.total) {
        parar();
        status('Fim do livro. 🎉');
        return;
      }
      const geracao = estado.geracao;
      while (estado.ultima <= estado.atual) {
        if (!(await anexarProxima())) { parar(); return; }
      }
      if (!estado.lendo || geracao !== estado.geracao) return;
      estado.atual++;
      atualizarBotoes();
      falarDe(0);
      return;
    }
    const fim = Texto.fimDaFrase(pagina, i);
    const { texto, offsets } = Texto.montarFala(pagina.palavras, i, fim);
    const fala = new SpeechSynthesisUtterance(texto);
    const voz = vozes.find(v => v.name === tela.voz.value);
    if (voz) { fala.voice = voz; fala.lang = voz.lang; } else fala.lang = 'pt-BR';
    fala.rate = +tela.velocidade.value;
    const geracao = ++estado.geracao;
    fala.onboundary = e => {
      if (geracao !== estado.geracao || (e.name && e.name !== 'word')) return;
      estado.recebeuPalavra = true;
      destacar(i + Texto.palavraNoChar(offsets, e.charIndex));
    };
    fala.onend = () => {
      if (geracao !== estado.geracao || !estado.lendo) return;
      falarDe(fim + 1);
    };
    fala.onerror = e => {
      if (geracao !== estado.geracao || e.error === 'interrupted' || e.error === 'canceled') return;
      parar();
      status('A voz parou com erro: ' + e.error);
    };
    marcarFrase(i, fim);
    destacar(i);
    sintese.speak(fala);
  }

  function tocar(apartirDe) {
    if (!estado.fonte || !sintese) return;
    estado.lendo = true;
    estado.seguir = true;
    tela.voltar.hidden = true;
    estado.geracao++;
    sintese.cancel();
    atualizarBotoes();
    const i = apartirDe === undefined ? estado.pos : apartirDe;
    // Pequena pausa: alguns navegadores ignoram uma fala pedida logo após o cancel()
    setTimeout(() => falarDe(i), 60);
    // Algumas vozes não avisam palavra por palavra: aí só a frase fica marcada
    estado.recebeuPalavra = false;
    clearTimeout(tocar.aviso);
    tocar.aviso = setTimeout(() => {
      if (estado.lendo && !estado.recebeuPalavra) status('Esta voz não avisa palavra por palavra: destaco a frase inteira. As vozes "Microsoft" costumam funcionar melhor.');
    }, 4000);
  }

  // Pausar = parar e lembrar a palavra (o pause() do navegador falha em vários casos)
  function parar() {
    estado.lendo = false;
    estado.geracao++;
    if (sintese) sintese.cancel();
    tela.voltar.hidden = true;
    atualizarBotoes();
  }

  function reiniciarSeLendo() { if (estado.lendo) tocar(estado.pos); }

  tela.tocar.onclick = () => (estado.lendo ? parar() : tocar());

  async function trocarPagina(delta) {
    const continuar = estado.lendo;
    parar();
    if (await irParaPagina(estado.atual + delta) && continuar) tocar(0);
  }
  tela.pagAnt.onclick = () => trocarPagina(-1);
  tela.pagProx.onclick = () => trocarPagina(1);

  // Clicar numa palavra (de qualquer página na tela): lê a partir dela
  tela.leitura.addEventListener('click', e => {
    const s = e.target.closest('.pal');
    if (!s) return;
    estado.atual = +s.closest('.pagina').dataset.pag;
    atualizarBotoes();
    tocar(+s.dataset.i);
  });

  // Atalhos: espaço = ler/pausar; setas = página
  document.addEventListener('keydown', e => {
    if (e.target.closest('select, input, textarea') || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (estado.fonte) tela.tocar.click(); }
    else if (e.key === 'ArrowRight' && !tela.pagProx.disabled) trocarPagina(1);
    else if (e.key === 'ArrowLeft' && !tela.pagAnt.disabled) trocarPagina(-1);
    else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) soltarDaLeitura();
  });
  // Botão com foco + espaço: o navegador "clica" no keyup. Sem isto, o espaço
  // pausava (keydown) e clicava o botão de novo (keyup).
  document.addEventListener('keyup', e => {
    if (e.code === 'Space' && e.target.closest('button')) e.preventDefault();
  });

  // ---------- abrir: botão, arrastar e exemplo ----------
  tela.entrada.onchange = () => { abrirArquivos(tela.entrada.files); tela.entrada.value = ''; };
  let arrastando = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { arrastando++; tela.soltar.hidden = false; } });
  window.addEventListener('dragleave', () => { if (--arrastando <= 0) { arrastando = 0; tela.soltar.hidden = true; } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    arrastando = 0;
    tela.soltar.hidden = true;
    abrirArquivos(e.dataTransfer.files);
  });

  const EXEMPLO = [
    'Bem-vindo ao Leitor de Livros! Este é um texto de exemplo para você testar.',
    '',
    'Aperte o botão de tocar e escute. Repare que a palavra que está sendo lida fica marcada em amarelo, e a frase inteira ganha um fundo mais claro. É como um karaokê de livro.',
    '',
    'Clique em qualquer palavra deste parágrafo e a leitura começa dali. A barra de espaço pausa e continua. As setas do teclado trocam de página.',
    '',
    'Durante a leitura, você pode rolar a página à vontade. Para a tela voltar a acompanhar a voz, toque em "Voltar para a leitura".',
    '',
    'Você pode abrir arquivos em PDF, fotos de páginas e textos simples. Se o PDF for escaneado, o programa reconhece as letras da imagem sozinho. Quando você fechar e abrir o mesmo arquivo de novo, ele lembra onde você parou.',
  ].join('\n');
  tela.exemplo.onclick = () => { parar(); iniciar(Object.assign(fonteDeTexto(EXEMPLO), { nome: 'Exemplo', chave: 'leitor:marca:exemplo' })); };

  // Sair da página no meio da leitura: cala a voz
  window.addEventListener('pagehide', () => { if (sintese) sintese.cancel(); });

  aplicarVisual();
  atualizarBotoes();
  if (new URLSearchParams(location.search).has('exemplo')) tela.exemplo.click();
})();
