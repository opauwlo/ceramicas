# Ateliê de Argila

Monte peças de argila em 3D no navegador, antes de modelar de verdade. Feito para o celular: discos, gotas, ondas em relevo, anéis pintados à mão, verniz, luz, foto e medidas em centímetros com o peso aproximado de massa.

**Site:** https://opauwlo.github.io/ceramicas/

## Como usar

- **Mover:** arraste a peça na mesa. Com o ímã ligado (aba Cena), ela assenta em cima do que estiver embaixo.
- **Girar a vista:** arraste o fundo com um dedo. Dois dedos aproximam e arrastam.
- **Peças:** adiciona disco, bolinha, gota, cilindro, bloco, anel e cone. Com uma peça selecionada, a nova nasce em cima dela.
- **Forma:** raio, espessura, borda arredondada, jeito feito à mão, posição, rotação e tamanho. Os botões − e + fazem ajuste fino.
- **Pintura:** cor, acabamento (fosco, acetinado, verniz, metal, vidro) e, nos discos, ondas em relevo, anéis pintados, sulcos e rótulo.
- **Cena:** fundo, luz, direção da luz e câmera.
- **Arquivo:** modelos prontos, salvar no aparelho, baixar foto, baixar o arquivo do modelo (`.json`) e STL em milímetros para impressão 3D.

O trabalho fica salvo sozinho no navegador. Desfazer e refazer ficam no topo (ou Ctrl+Z e Ctrl+Shift+Z).

## Desenvolvimento

```bash
npm install
npm run dev        # servidor local
npm test           # testes (Vitest)
npm run typecheck  # tipos
npm run build      # build de produção em dist/
```

Feito com React, React Three Fiber, three.js, Zustand e Vite.

## Publicação

Cada push roda tipos, testes e build no GitHub Actions. Quando o push é no `main` e tudo passa, o site é publicado no GitHub Pages.

## Estrutura

- `src/model`: tipos, catálogo de peças, validação de modelos e modelos prontos
- `src/geometry`: geometrias, volume, pintura do disco e materiais
- `src/scene`: cena 3D, arrastar, câmera, foto e exportação STL
- `src/state`: estado, histórico de desfazer e medidas
- `src/ui`: painel, abas e controles
