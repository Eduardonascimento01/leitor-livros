// texto.js: transforma o texto bruto (do PDF, do OCR ou do .txt) em
// parágrafos e palavras, e prepara cada frase para a voz falar.
// Não mexe na tela: por isso dá para testar no Node (teste.js).
(function (raiz) {
  'use strict';

  // Cada palavra é um "token": { t: texto, caixas: [{x, y, w, h}] }.
  // As caixas dizem onde a palavra está na página original, em frações (0 a 1)
  // da largura e da altura: assim servem para qualquer tamanho de tela.
  const tokens = linha => (linha.match(/\S+/g) || []).map(t => ({ t, caixas: [] }));
  const textoDaLinha = l => l.map(w => w.t).join(' ');

  // Junta os pedaços de texto que o PDF.js devolve em linhas de palavras.
  // Cada item tem: str (texto), hasEOL (fim de linha), transform[3/4/5] (tamanho, x, y), width.
  // "conv" (opcional) transforma a posição do PDF em caixa na página.
  function linhasTokensDoPdf(itens, conv) {
    const linhas = [];
    let atual = [];
    let ultimoY = null;
    let fimX = null;
    let colado = false;   // o último pedaço terminou no meio de uma palavra?
    const fecharLinha = () => {
      if (atual.length) linhas.push(atual);
      atual = []; fimX = null; colado = false;
    };
    for (const it of itens) {
      const tr = it.transform || [10, 0, 0, 10, 0, 0];
      const x = tr[4], y = tr[5];
      const tam = Math.abs(tr[3]) || 10;
      // Mudou de altura sem aviso de fim de linha: é linha nova
      if (ultimoY !== null && Math.abs(y - ultimoY) > tam * 0.5 && atual.length) fecharLinha();
      const str = it.str || '';
      if (str) {
        // Alguns PDFs não colocam o espaço entre palavras: deduz pela distância
        if (/^\s/.test(str) || (fimX !== null && x - fimX > tam * 0.15)) colado = false;
        const larguraLetra = (it.width || 0) / str.length;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(str))) {
          const caixa = conv ? conv(x + m.index * larguraLetra, y, m[0].length * larguraLetra, tam) : null;
          if (m.index === 0 && colado && atual.length) {
            // continuação da mesma palavra que veio no pedaço anterior
            const ult = atual[atual.length - 1];
            ult.t += m[0];
            if (caixa) ult.caixas.push(caixa);
          } else {
            atual.push({ t: m[0], caixas: caixa ? [caixa] : [] });
          }
        }
        colado = !/\s$/.test(str);
        ultimoY = y;
        fimX = x + (it.width || 0);
      }
      if (it.hasEOL) fecharLinha();
    }
    fecharLinha();
    return linhas;
  }
  const linhasDoPdf = itens => linhasTokensDoPdf(itens).map(textoDaLinha);

  // Linhas e palavras que o OCR (Tesseract.js) achou, com a caixa de cada palavra.
  // larg/alt: tamanho da imagem em pixels, para virar fração.
  function linhasTokensDoOcr(dados, larg, alt) {
    const linhas = [];
    for (const par of dados.paragraphs || []) {
      for (const ln of par.lines || []) {
        linhas.push((ln.words || []).filter(w => w.text && w.text.trim()).map(w => ({
          t: w.text.trim().replace(/\s+/g, ''),
          caixas: [{ x: w.bbox.x0 / larg, y: w.bbox.y0 / alt,
            w: (w.bbox.x1 - w.bbox.x0) / larg, h: (w.bbox.y1 - w.bbox.y0) / alt }],
        })));
      }
      linhas.push([]);   // fim do parágrafo do OCR
    }
    return linhas;
  }

  // Junta linhas de palavras em parágrafos. Regras:
  // - linha vazia separa parágrafos;
  // - "pala-" + "vra" vira "palavra" (e a palavra fica com as 2 caixas);
  // - linha curta que termina em ponto encerra o parágrafo.
  function paragrafosDeTokens(linhas) {
    const maior = Math.max(1, ...linhas.map(l => textoDaLinha(l).length));
    const paragrafos = [];
    let atual = [];
    for (const l of linhas) {
      if (!l.length) {
        if (atual.length) paragrafos.push(atual);
        atual = [];
        continue;
      }
      let resto = l;
      const ult = atual[atual.length - 1];
      if (ult && /[A-Za-zÀ-ÿ]-$/.test(ult.t) && /^[a-zà-ÿ]/.test(l[0].t)) {
        atual[atual.length - 1] = { t: ult.t.slice(0, -1) + l[0].t, caixas: ult.caixas.concat(l[0].caixas) };
        resto = l.slice(1);
      }
      for (const w of resto) atual.push({ t: w.t, caixas: w.caixas.slice() });
      const texto = textoDaLinha(l);
      if (/[.!?…:]["”'»)]*$/.test(texto) && texto.length < maior * 0.75) {
        paragrafos.push(atual);
        atual = [];
      }
    }
    if (atual.length) paragrafos.push(atual);
    return paragrafos;
  }

  // Versão com texto simples (linhas de texto -> parágrafos de texto)
  const paragrafosDeLinhas = linhas =>
    paragrafosDeTokens(linhas.map(tokens)).map(textoDaLinha);

  // Monta a "página" que o leitor usa: lista de palavras + caixas + onde cada parágrafo começa e termina.
  // Aceita parágrafos em texto ("uma frase") ou em tokens ([{t, caixas}]).
  function montarPagina(paragrafos) {
    const palavras = [];
    const caixas = [];
    const blocos = [];            // [inicio, fim] de cada parágrafo (índices de palavras)
    const fimParagrafo = new Set();
    for (const p of paragrafos) {
      const ws = typeof p === 'string' ? tokens(p) : p;
      if (!ws.length) continue;
      const ini = palavras.length;
      for (const w of ws) { palavras.push(w.t); caixas.push(w.caixas || []); }
      blocos.push([ini, palavras.length - 1]);
      fimParagrafo.add(palavras.length - 1);
    }
    return { palavras, caixas, blocos, fimParagrafo };
  }

  const FIM_DE_FRASE = /[.!?…;]["”'»)\]]*$/;
  const MAX_PALAVRAS = 30; // frases curtas: o Chrome costuma travar falas longas

  // A partir da palavra "inicio", acha onde a frase termina.
  function fimDaFrase(pagina, inicio) {
    const ultima = pagina.palavras.length - 1;
    for (let i = inicio; i <= ultima; i++) {
      if (FIM_DE_FRASE.test(pagina.palavras[i]) || pagina.fimParagrafo.has(i) ||
          i - inicio + 1 >= MAX_PALAVRAS) return i;
    }
    return ultima;
  }

  // Texto que vai para a voz + a posição (letra) onde cada palavra começa nele.
  function montarFala(palavras, ini, fim) {
    const offsets = [];
    let texto = '';
    for (let i = ini; i <= fim; i++) {
      if (texto) texto += ' ';
      offsets.push(texto.length);
      texto += palavras[i];
    }
    return { texto, offsets };
  }

  // A voz avisa "estou na letra N": devolve qual palavra (contando da 1ª da fala) é essa.
  function palavraNoChar(offsets, charIndex) {
    let lo = 0, hi = offsets.length - 1, resp = 0;
    while (lo <= hi) {
      const meio = (lo + hi) >> 1;
      if (offsets[meio] <= charIndex) { resp = meio; lo = meio + 1; } else hi = meio - 1;
    }
    return resp;
  }

  // Texto comprido (.txt) vira várias páginas de ~350 palavras, sem cortar parágrafo.
  function dividirEmPaginas(paragrafos, porPagina = 350) {
    const paginas = [];
    let atual = [], conta = 0;
    for (const p of paragrafos) {
      const n = p.split(/\s+/).filter(Boolean).length;
      if (conta && conta + n > porPagina) { paginas.push(atual); atual = []; conta = 0; }
      atual.push(p);
      conta += n;
    }
    if (atual.length) paginas.push(atual);
    return paginas.length ? paginas : [[]];
  }

  const api = { linhasDoPdf, linhasTokensDoPdf, linhasTokensDoOcr, paragrafosDeTokens, paragrafosDeLinhas, montarPagina, fimDaFrase,
    montarFala, palavraNoChar, dividirEmPaginas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Texto = api;
})(this);
