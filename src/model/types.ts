export type Vec3 = [number, number, number];

export type PieceType = 'disco' | 'cilindro' | 'esfera' | 'gota' | 'caixa' | 'anel' | 'cone';
export type Finish = 'fosco' | 'acetinado' | 'verniz' | 'metal' | 'vidro';
export type BgKey = 'caderno' | 'mesa' | 'agua' | 'noite';
export type LightKey = 'mesa' | 'estudio' | 'contraluz';

/** Anéis pintados à mão sobre o disco. */
export interface Rings {
  on: boolean;
  cor: string;
  qtd: number;
  /** espessura do traço em mm */
  esp: number;
  /** distância do centro, fração do raio */
  inicio: number;
  /** traço quebrado, com cara de pincel */
  mao: boolean;
}

/** Rótulo pintado no centro do disco. */
export interface Label {
  on: boolean;
  cor: string;
  /** raio do rótulo, fração do raio do disco */
  tam: number;
  texto: string;
  corTexto: string;
}

/** Acabamentos que só o disco tem: relevo em ondas e pintura. */
export interface Surface {
  /** altura das ondas em cm */
  amp: number;
  qtd: number;
  inicio: number;
  /** profundidade do centro afundado em cm */
  cratera: number;
  sulcos: boolean;
  aneis: Rings;
  rotulo: Label;
}

/** Uma peça na mesa. Medidas em centímetros, ângulos em graus. */
export interface Piece {
  id: string;
  type: PieceType;
  name: string;
  visible: boolean;
  pos: Vec3;
  rot: Vec3;
  scale: number;
  color: string;
  finish: Finish;
  /** força da textura da argila, de 0 a 1 */
  clay: number;
  seed: number;
  p: Record<string, number>;
  s: Surface | null;
}

/** O modelo inteiro, que vai para o histórico, para o armazenamento e para o arquivo exportado. */
export interface Doc {
  v: 1;
  bg: BgKey;
  light: LightKey;
  lightAngle: number;
  pieces: Piece[];
}
