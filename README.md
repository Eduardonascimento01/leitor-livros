# 📖 Leitor de Livros

Lê PDFs, fotos de páginas e arquivos `.txt` em voz alta, **destacando a palavra que está sendo lida** (como um karaokê de livro). Roda direto no navegador: não precisa instalar nada.

## O que já faz (versão 1)
- Abre **PDF** (com texto ou escaneado), **imagens** (JPG, PNG; várias de uma vez viram páginas) e **.txt**, pelo botão ou arrastando o arquivo para a janela.
- PDF escaneado e imagens passam por **OCR** (reconhecimento de letras) em português, com o Tesseract.js.
- **Voz** do próprio navegador: escolha a voz e a velocidade (0.5x a 2.5x).
- A **palavra** lida fica em amarelo e a **frase** ganha um fundo claro.
- **Clique numa palavra** para ler a partir dela.
- **Marcador automático:** ao abrir o mesmo arquivo de novo, continua de onde parou.
- **Rolagem contínua:** as páginas aparecem uma embaixo da outra. Durante a leitura você pode rolar à vontade; o botão "Voltar para a leitura" faz a tela acompanhar a voz de novo.
- **Ver página original** (PDF e imagens): mostra o livro como ele é, uma página embaixo da outra, e marca a palavra lida em cima da própria página (como um marca-texto). O botão alterna com o modo texto.
- Passa de página sozinho; tema claro/escuro; letra maior ou menor; funciona no celular.

### Atalhos
| Tecla | Ação |
|---|---|
| Espaço | ler / pausar |
| ← → | página anterior / próxima |

## Como usar
- **Online:** https://eduardonascimento01.github.io/leitor-livros/
- **No computador:** baixe o projeto e abra o `index.html` no Chrome ou no Edge (precisa de internet na 1ª vez, para carregar o leitor de PDF e o OCR).
- Experimente o botão **Ver exemplo**.

> Dica: o destaque palavra por palavra depende da voz. No Edge, as vozes "Natural" (ex.: Francisca, Antônio) funcionam muito bem. Se uma voz não avisar as palavras, o programa destaca só a frase.

## Como funciona (resumo)
1. `texto.js`: transforma o texto bruto em parágrafos e palavras, e prepara cada frase para a voz (junta "pala-" + "vra", corta frases longas).
2. `app.js`: a tela, a abertura dos arquivos e a voz. A voz (Web Speech API) fala uma frase por vez e avisa em qual letra está (evento `onboundary`); o programa converte essa posição na palavra e a pinta.
3. Bibliotecas por CDN: [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 e [Tesseract.js](https://tesseract.projectnaptha.com/) 5.1.1.

## Testes
```
node teste.js
```

## Próximas ideias
- [ ] Tocar numa palavra e ver o significado (dicionário)
- [ ] Marcar trechos e exportar as marcações em Markdown
- [ ] Resumo do capítulo e explicação de trecho com IA (Groq)
- [ ] Abrir EPUB
- [ ] Timer de sono
- [ ] Gerar MP3 do capítulo
- [ ] Estatísticas de leitura (minutos por dia)
- [ ] Barra de controles mais compacta no celular
