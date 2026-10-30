# Ateliê de Argila

Monte peças de argila em 3D no navegador, antes de modelar de verdade. Feito para o celular: discos, gotas, ondas em relevo, anéis pintados à mão, verniz, luz, foto e medidas em centímetros com o peso aproximado de massa.

**Site:** https://opauwlo.github.io/ceramicas/

## Como usar

### Massa (sovar)

Uma bola de porcelana fria em cima da tábua, para modelar com o dedo como massa de verdade.

- **Aperte:** encoste e segure. O dedo afunda e a massa estufa em volta (o volume nunca muda).
- **Arraste:** a massa vai junto com o dedo, abrindo um sulco macio.
- **Esfregue:** vai e volta rapidinho no mesmo lugar para alisar.
- **Belisque:** com um dedo na massa, junte o segundo dedo para puxar uma ponta (orelha, bico, antena). Afastando, achata.
- **Pingos de tinta:** escolha uma cor, toque na massa e sove. A tinta vira rastro, mármore e, sovando mais, uma cor só. Azul com amarelo dá verde.
- **Gire e aproxime:** arraste fora da massa para girar a tábua; dois dedos aproximam.
- A massa treme e assenta, o celular vibra e tem som de massa (dá para desligar no alto-falante).
- **Massa nova**, desfazer e refazer, foto e STL em milímetros. A massa fica guardada no aparelho.

### Peças

- **Mãos (canto da mesa):** escolha o que o dedo faz ao tocar numa peça.
  - **Mover:** arraste a peça e ela gruda onde o dedo estiver: em cima de outra peça assenta, de lado gruda virada para fora. Com o ímã desligado (aba Cena), anda solta.
  - **Amassar:** arraste para baixo para achatar e para cima para esticar. O volume não muda, como na massa de verdade.
  - **Girar:** arraste para os lados, como no torno. Solte com embalo e ela continua girando.
  - **Alisar:** esfregue o dedo na peça para tirar o jeito torto e a textura.
  - **Pintar:** escolha a cor na paleta e toque nas peças. Passando o dedo, pinta várias de uma vez.
- **Com as mãos (aba Forma):** os mesmos amassar, esticar e alisar por botão.
- **Girar a vista:** arraste o fundo com um dedo. Dois dedos aproximam e arrastam.
- **Peças:** escolha disco, bolinha, gota, cilindro, bloco, anel ou cone e toque na mesa ou numa peça: a nova gruda ali. "Pôr direto" deixa no meio, ou em cima da peça selecionada.
- **Espelhar:** com uma peça selecionada, cria o par do outro lado (esquerda e direita como se vê na tela), espelhado pelo meio da peça em que ela está grudada. Bom para asas, orelhas e antenas.
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

Para ligar a publicação uma vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Depois, em **Actions**, rode de novo o último workflow do `main` (ou faça qualquer push).

## Estrutura

- `src/clay`: a massa de sovar — malha, deformação que conserva volume, pigmento, gestos, som, vibração e a tela
- `src/model`: tipos, catálogo de peças, validação de modelos e modelos prontos
- `src/geometry`: geometrias, volume, pintura do disco e materiais
- `src/scene`: cena 3D, arrastar, câmera, foto e exportação STL
- `src/state`: estado, histórico de desfazer e medidas
- `src/ui`: painel, abas e controles
