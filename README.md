# Ateliê de Argila

Monte peças de argila em 3D no navegador, antes de modelar de verdade. Feito para o celular: discos, gotas, ondas em relevo, anéis pintados à mão, verniz, luz, foto e medidas em centímetros com o peso aproximado de massa.

**Site:** https://opauwlo.github.io/ceramicas/

## Como usar

### Massa (bancada de cerâmica fria)

Uma bola de porcelana fria na base de corte, em cima de uma bailarina (prato giratório). A ferramenta escolhida fica deitada ao lado da massa, sempre à vista; um toque manda ela trabalhar, com animação, e ela volta para o lugar.

- **Ímã:** enquanto o dedo está na tela aparece a sugestão do que vai acontecer. Ela gruda no meio da massa, na grade de 0,5 cm da base de corte, endireita linhas em ângulos de 45° e transforma uma volta torta num círculo certinho. Soltou, a ferramenta faz.
- **Dedo:** aperte e segure (afunda e a massa estufa em volta), arraste, esfregue para alisar, belisque com dois dedos.
- **Rolo e niveladores:** cada toque é uma passada (vai e volta), alternando a direção; segurando, continua rolando. Os niveladores de 3, 5 ou 8 mm seguram a espessura.
- **Boleador (P, M, G):** toque para um buraquinho redondo; arraste para um sulco.
- **Esteca (fina ou grossa):** risque e solte: quase reto vira reta, uma volta em torno do meio vira círculo.
- **Espátula:** risque onde quer cortar e solte. O que sai vira sobra.
- **Cortadores:** círculo, coração, estrela, folha e flor, em três tamanhos.
- **Silicone, pincel d'água, esponja e lixa:** vêm até o dedo e trabalham enquanto ele anda (com o traço suavizado). A água deixa a massa mais escura e brilhante e seca sozinha; a lixa tira um pouquinho de massa e o verniz.
- **Tinta:** pingue (o pingo cai do potinho) e sove para tingir a massa, ou pinte por cima com o pincel.
- **Verniz:** brilho ou fosco, pincelado onde quiser.
- **Bailarina:** gira só enquanto você arrasta fora da massa; o botão Girar dá um quarto de volta. Para cima e para baixo inclina a vista; dois dedos aproximam.
- O volume da massa nunca muda sozinho: só a espátula, os cortadores e a lixa tiram massa, e o peso aparece embaixo.
- Cada ferramenta tem som e vibração próprios (dá para tirar o som no alto-falante). Desfazer, massa nova, foto e STL em milímetros. A massa fica guardada no aparelho.

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
