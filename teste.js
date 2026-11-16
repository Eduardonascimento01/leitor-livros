// Testes da lógica de texto. Rodar com: node teste.js
const assert = require('assert');
const T = require('./texto.js');

let ok = 0;
function teste(nome, fn) { fn(); ok++; console.log('ok  ' + nome); }

teste('linhas do PDF com fim de linha e espaço deduzido', () => {
  const it = (str, x, y, w, eol) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, hasEOL: !!eol });
  const linhas = T.linhasDoPdf([it('Olá', 0, 100, 15), it('mundo.', 20, 100, 30, true), it('Fim', 0, 85, 15)]);
  assert.deepStrictEqual(linhas, ['Olá mundo.', 'Fim']);
});

teste('parágrafos: hífen, linha vazia e linha curta com ponto', () => {
  const ps = T.paragrafosDeLinhas([
    'Era uma vez uma pala-', 'vra que foi cortada no fim da linha de cima e',
    'continuou.', '', 'Outro parágrafo.']);
  assert.deepStrictEqual(ps, ['Era uma vez uma palavra que foi cortada no fim da linha de cima e continuou.', 'Outro parágrafo.']);
});

teste('montar página e achar fim da frase', () => {
  const p = T.montarPagina(['Uma frase. Outra frase sem ponto', 'Novo parágrafo.']);
  assert.strictEqual(p.palavras.length, 8);
  assert.strictEqual(T.fimDaFrase(p, 0), 1);   // "frase."
  assert.strictEqual(T.fimDaFrase(p, 2), 5);   // fim do parágrafo
  assert.strictEqual(T.fimDaFrase(p, 6), 7);
});

teste('frase longa é cortada em 30 palavras', () => {
  const p = T.montarPagina([Array(70).fill('a').join(' ')]);
  assert.strictEqual(T.fimDaFrase(p, 0), 29);
});

teste('posição da letra vira palavra', () => {
  const { texto, offsets } = T.montarFala(['ab', 'cde', 'f'], 0, 2);
  assert.strictEqual(texto, 'ab cde f');
  assert.deepStrictEqual(offsets, [0, 3, 7]);
  assert.strictEqual(T.palavraNoChar(offsets, 0), 0);
  assert.strictEqual(T.palavraNoChar(offsets, 4), 1);
  assert.strictEqual(T.palavraNoChar(offsets, 7), 2);
});

teste('dividir texto longo em páginas', () => {
  const pgs = T.dividirEmPaginas(Array(5).fill(Array(100).fill('x').join(' ')), 350);
  assert.deepStrictEqual(pgs.map(p => p.length), [3, 2]);
});

teste('caixas do PDF: palavra partida em 2 pedaços vira 1 palavra com 2 caixas', () => {
  const it = (str, x, y, w, eol) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, hasEOL: !!eol });
  const conv = (x, y, w) => ({ x, y, w, h: 1 });
  // "Capi" + "tães" colados (sem espaço e sem distância) e depois " da" separado
  const linhas = T.linhasTokensDoPdf([it('Capi', 0, 100, 20), it('tães', 20, 100, 20), it(' da', 40, 100, 15, true)], conv);
  assert.deepStrictEqual(linhas[0].map(w => w.t), ['Capitães', 'da']);
  assert.strictEqual(linhas[0][0].caixas.length, 2);
  assert.strictEqual(linhas[0][1].caixas[0].x, 45);   // " da": a palavra começa depois do espaço
});

teste('hífen no fim da linha junta as caixas das duas partes', () => {
  const tk = (t, x) => ({ t, caixas: [{ x, y: 0, w: 1, h: 1 }] });
  const ps = T.paragrafosDeTokens([[tk('uma', 0), tk('pala-', 1)], [tk('vra.', 2)]]);
  assert.deepStrictEqual(ps[0].map(w => w.t), ['uma', 'palavra.']);
  assert.deepStrictEqual(ps[0][1].caixas.map(c => c.x), [1, 2]);
  const p = T.montarPagina(ps);
  assert.strictEqual(p.caixas[1].length, 2);
});

teste('OCR: caixas viram frações da imagem e parágrafos são separados', () => {
  const w = (text, x0) => ({ text, bbox: { x0, y0: 50, x1: x0 + 100, y1: 100 } });
  const dados = { paragraphs: [{ lines: [{ words: [w('Olá', 0), w('mundo', 200)] }] }, { lines: [{ words: [w('Fim', 0)] }] }] };
  const ps = T.paragrafosDeTokens(T.linhasTokensDoOcr(dados, 1000, 500));
  assert.deepStrictEqual(ps.map(p => p.map(x => x.t).join(' ')), ['Olá mundo', 'Fim']);
  assert.deepStrictEqual(ps[0][1].caixas[0], { x: 0.2, y: 0.1, w: 0.1, h: 0.1 });
});

console.log(`\n${ok} testes passaram.`);
