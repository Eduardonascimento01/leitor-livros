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

console.log(`\n${ok} testes passaram.`);
