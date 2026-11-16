// texto.js: transforma o texto bruto (do PDF, do OCR ou do .txt) em
// parágrafos e palavras, e prepara cada frase para a voz falar.
// Não mexe na tela: por isso dá para testar no Node (teste.js).
(function (raiz) {
  'use strict';

  // Junta os pedaços de texto que o PDF.js devolve em linhas.
  // Cada item tem: str (texto), hasEOL (fim de linha), transform[4/5] (x, y), width.
  function linhasDoPdf(itens) {
    const linhas = [];
    let atual = '';
    let ultimoY = null;
    let fimX = null;
    for (const it of itens) {
      const x = it.transform ? it.transform[4] : 0;
      const y = it.transform ? it.transform[5] : 0;
      const tam = it.transform ? Math.abs(it.transform[3]) || 10 : 10;
      // Mudou de altura sem aviso de fim de linha: é linha nova
      if (ultimoY !== null && Math.abs(y - ultimoY) > tam * 0.5 && atual.trim()) {
        linhas.push(atual);
        atual = '';
        fimX = null;
      }
      // Alguns PDFs não colocam o espaço entre palavras: deduz pela distância
      if (it.str && atual && !/\s$/.test(atual) && !/^\s/.test(it.str) &&
          fimX !== null && x - fimX > tam * 0.15) {
        atual += ' ';
      }
      atual += it.str || '';
      if (it.str) { ultimoY = y; fimX = x + (it.width || 0); }
      if (it.hasEOL) {
        linhas.push(atual);
        atual = '';
        fimX = null;
      }
    }
    if (atual.trim()) linhas.push(atual);
    return linhas;
  }

  // Junta linhas em parágrafos. Regras:
  // - linha vazia separa parágrafos;
  // - "pala-" + "vra" vira "palavra";
  // - linha curta que termina em ponto encerra o parágrafo.
  function paragrafosDeLinhas(linhas) {
    const limpas = linhas.map(l => l.replace(/\s+/g, ' ').trim());
    const maior = Math.max(1, ...limpas.map(l => l.length));
    const paragrafos = [];
    let atual = '';
    let linhaAnterior = '';
    for (const l of limpas) {
      if (!l) {
        if (atual) paragrafos.push(atual);
        atual = '';
        linhaAnterior = '';
        continue;
      }
      if (!atual) {
        atual = l;
      } else if (/[A-Za-zÀ-ÿ]-$/.test(atual) && /^[a-zà-ÿ]/.test(l)) {
        atual = atual.slice(0, -1) + l;
      } else {
        atual += ' ' + l;
      }
      linhaAnterior = l;
      if (/[.!?…:]["”'»)]*$/.test(linhaAnterior) && linhaAnterior.length < maior * 0.75) {
        paragrafos.push(atual);
        atual = '';
      }
    }
    if (atual) paragrafos.push(atual);
    return paragrafos;
  }

  // Monta a "página" que o leitor usa: lista de palavras + onde cada parágrafo começa e termina.
  function montarPagina(paragrafos) {
    const palavras = [];
    const blocos = [];            // [inicio, fim] de cada parágrafo (índices de palavras)
    const fimParagrafo = new Set();
    for (const p of paragrafos) {
      const ps = p.split(/\s+/).filter(Boolean);
      if (!ps.length) continue;
      const ini = palavras.length;
      palavras.push(...ps);
      blocos.push([ini, palavras.length - 1]);
      fimParagrafo.add(palavras.length - 1);
    }
    return { palavras, blocos, fimParagrafo };
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

  const api = { linhasDoPdf, paragrafosDeLinhas, montarPagina, fimDaFrase,
    montarFala, palavraNoChar, dividirEmPaginas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Texto = api;
})(this);
