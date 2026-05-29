import type { HandTrackingData, HandTrackingHint } from '../tracking/HandTrackingTypes';

const FINGERS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];
const PALM = [0, 5, 9, 13, 17];

interface Point {
  x: number;
  y: number;
}

export class FingerVideoOverlay {
  readonly canvas = document.createElement('canvas');

  private readonly context: CanvasRenderingContext2D;
  private readonly smoothedPoints: Point[] = [];
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private hasSmoothedHand = false;

  constructor() {
    const context = this.canvas.getContext('2d', { alpha: true });

    if (!context) {
      throw new Error('Could not create finger overlay canvas context.');
    }

    this.context = context;
    this.canvas.className = 'finger-video-overlay';
    this.resize();
  }

  resize(width = window.innerWidth, height = window.innerHeight): void {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.canvas.width = Math.floor(this.width * this.pixelRatio);
    this.canvas.height = Math.floor(this.height * this.pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  update(video: HTMLVideoElement, hand: HandTrackingData | null): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.drawPlacementGuide(hand?.quality.hint ?? 'searching');

    if (!hand?.detected || hand.landmarks.length === 0) {
      this.hasSmoothedHand = false;
      return;
    }

    const rawPoints = hand.landmarks.map((point) => ({
      x: point.x * this.width,
      y: point.y * this.height,
    }));
    this.getStableDisplayPoints(rawPoints, hand.quality.usable);
    this.drawAimCursor(hand);
  }

  private drawPlacementGuide(hint: HandTrackingHint): void {
    const good = hint === 'good';
    const edge = hint === 'edge';
    const inset = Math.max(10, Math.min(this.width, this.height) * 0.035);
    const corner = Math.max(26, Math.min(this.width, this.height) * 0.11);

    this.context.save();
    this.context.globalAlpha = good ? 0.13 : edge ? 0.22 : 0.34;
    this.context.strokeStyle = good
      ? 'rgba(110, 255, 210, 0.62)'
      : edge
        ? 'rgba(170, 245, 255, 0.72)'
        : 'rgba(150, 240, 255, 0.82)';
    this.context.lineWidth = 1.5;

    this.context.beginPath();
    this.drawCornerFrame(inset, inset, corner, corner);
    this.drawCornerFrame(this.width - inset, inset, -corner, corner);
    this.drawCornerFrame(inset, this.height - inset, corner, -corner);
    this.drawCornerFrame(this.width - inset, this.height - inset, -corner, -corner);
    this.context.stroke();

    this.context.globalAlpha *= 0.45;
    this.context.fillStyle = this.context.strokeStyle;
    this.context.fillRect(inset, this.height * 0.5, this.width - inset * 2, 1);
    this.context.fillRect(this.width * 0.5, inset, 1, this.height - inset * 2);
    this.context.restore();

    if (hint !== 'good') {
      this.drawHintText(hint);
    }
  }

  private drawHintText(hint: HandTrackingHint): void {
    const text = getHintText(hint);
    this.context.save();
    this.context.font = '600 12px Inter, system-ui, sans-serif';
    this.context.textAlign = 'center';
    this.context.fillStyle = 'rgba(214, 250, 255, 0.82)';
    this.context.shadowColor = 'rgba(0, 0, 0, 0.85)';
    this.context.shadowBlur = 8;
    this.context.fillText(text, this.width * 0.5, this.height * 0.22);
    this.context.restore();
  }

  private drawVirtualHand(points: Point[], scale: number, pinching: boolean): void {
    this.context.save();
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.shadowColor = pinching ? 'rgba(255, 56, 96, 0.58)' : 'rgba(130, 245, 255, 0.42)';
    this.context.shadowBlur = pinching ? 20 : 12;

    this.drawPalm(points, scale, pinching);

    for (const finger of FINGERS) {
      this.drawFinger(points, finger, scale, pinching);
    }

    this.drawJoints(points, scale, pinching);
    this.context.restore();
  }

  private drawPalm(points: Point[], scale: number, pinching: boolean): void {
    this.context.save();
    this.context.beginPath();
    this.context.moveTo(points[PALM[0]].x, points[PALM[0]].y);
    for (const index of PALM.slice(1)) {
      this.context.lineTo(points[index].x, points[index].y);
    }
    this.context.closePath();
    const gradient = this.context.createLinearGradient(points[0].x, points[0].y, points[9].x, points[9].y);
    gradient.addColorStop(0, pinching ? 'rgba(255, 225, 234, 0.54)' : 'rgba(238, 251, 255, 0.44)');
    gradient.addColorStop(0.45, 'rgba(128, 162, 174, 0.36)');
    gradient.addColorStop(1, 'rgba(26, 38, 48, 0.28)');
    this.context.fillStyle = gradient;
    this.context.strokeStyle = pinching ? 'rgba(255, 245, 248, 0.86)' : 'rgba(236, 252, 255, 0.74)';
    this.context.lineWidth = Math.max(1.4, scale * 0.024);
    this.context.fill();
    this.context.stroke();

    this.context.globalAlpha = 0.68;
    this.context.strokeStyle = 'rgba(40, 255, 226, 0.36)';
    this.context.lineWidth = Math.max(0.8, scale * 0.009);
    for (const [fromIndex, toIndex] of [
      [5, 17],
      [0, 9],
      [5, 9],
      [9, 13],
      [13, 17],
    ]) {
      this.context.beginPath();
      this.context.moveTo(points[fromIndex].x, points[fromIndex].y);
      this.context.lineTo(points[toIndex].x, points[toIndex].y);
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawFinger(points: Point[], indices: number[], scale: number, pinching: boolean): void {
    const baseWidth = Math.max(8, scale * 0.108);

    this.context.save();
    for (let index = 0; index < indices.length - 1; index += 1) {
      const from = points[indices[index]];
      const to = points[indices[index + 1]];
      const width = baseWidth * (1 - index * 0.13);
      const gradient = this.context.createLinearGradient(from.x, from.y, to.x, to.y);
      gradient.addColorStop(0, pinching ? 'rgba(255, 236, 242, 0.82)' : 'rgba(245, 253, 255, 0.72)');
      gradient.addColorStop(0.54, 'rgba(118, 150, 162, 0.44)');
      gradient.addColorStop(1, 'rgba(18, 28, 36, 0.34)');

      this.context.beginPath();
      this.context.moveTo(from.x, from.y);
      this.context.lineTo(to.x, to.y);
      this.context.lineWidth = width;
      this.context.strokeStyle = gradient;
      this.context.stroke();

      this.context.beginPath();
      this.context.moveTo(from.x, from.y);
      this.context.lineTo(to.x, to.y);
      this.context.lineWidth = Math.max(1, width * 0.18);
      this.context.strokeStyle = pinching ? 'rgba(255, 68, 112, 0.5)' : 'rgba(80, 255, 232, 0.38)';
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawJoints(points: Point[], scale: number, pinching: boolean): void {
    const radius = Math.max(2.4, scale * 0.018);
    this.context.fillStyle = pinching ? 'rgba(255, 70, 110, 0.92)' : 'rgba(220, 252, 255, 0.68)';
    this.context.strokeStyle = 'rgba(5, 12, 18, 0.7)';
    this.context.lineWidth = Math.max(0.7, scale * 0.004);

    for (const point of points) {
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
    }
  }

  private drawAimCursor(hand: HandTrackingData): void {
    const x = ((hand.aim.aimX + 1) * 0.5) * this.width;
    const y = ((-hand.aim.aimY + 1) * 0.5) * this.height;

    this.context.save();
    this.context.globalAlpha = hand.quality.usable ? 0.74 : 0.42;
    this.context.strokeStyle = hand.aim.pinchActive ? 'rgba(255, 244, 248, 0.96)' : 'rgba(230, 255, 255, 0.76)';
    this.context.lineWidth = 1.25;
    this.context.beginPath();
    this.context.arc(x, y, hand.aim.pinchActive ? 18 : 11, 0, Math.PI * 2);
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(x - 4, y);
    this.context.lineTo(x + 4, y);
    this.context.moveTo(x, y - 4);
    this.context.lineTo(x, y + 4);
    this.context.stroke();
    this.context.restore();
  }

  private getHandScale(points: Point[]): number {
    return Math.max(distance(points[0], points[9]), distance(points[5], points[17]), distance(points[0], points[12]));
  }

  private getStableDisplayPoints(rawPoints: Point[], usable: boolean): Point[] {
    const normalized = normalizeHandSize(rawPoints, Math.min(this.width, this.height) * 0.31);
    const alpha = usable ? 0.1 : 0.055;

    if (!this.hasSmoothedHand || this.smoothedPoints.length !== normalized.length) {
      this.smoothedPoints.length = 0;
      this.smoothedPoints.push(...normalized.map((point) => ({ ...point })));
      this.hasSmoothedHand = true;
      return this.smoothedPoints;
    }

    for (let index = 0; index < normalized.length; index += 1) {
      this.smoothedPoints[index].x += (normalized[index].x - this.smoothedPoints[index].x) * alpha;
      this.smoothedPoints[index].y += (normalized[index].y - this.smoothedPoints[index].y) * alpha;
    }

    return this.smoothedPoints;
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.context.beginPath();
    this.context.moveTo(x + radius, y);
    this.context.arcTo(x + width, y, x + width, y + height, radius);
    this.context.arcTo(x + width, y + height, x, y + height, radius);
    this.context.arcTo(x, y + height, x, y, radius);
    this.context.arcTo(x, y, x + width, y, radius);
    this.context.closePath();
  }

  private drawCornerFrame(x: number, y: number, width: number, height: number): void {
    this.context.moveTo(x + width, y);
    this.context.lineTo(x, y);
    this.context.lineTo(x, y + height);
  }
}

function getHintText(hint: HandTrackingHint): string {
  switch (hint) {
    case 'tooClose':
      return 'Recule un peu la main';
    case 'tooFar':
      return 'Rapproche la main';
    case 'edge':
      return 'Main detectee';
    case 'searching':
      return 'Montre un doigt ou une main';
    default:
      return '';
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeHandSize(points: Point[], targetScale: number): Point[] {
  const anchor = points[9];
  const currentScale = Math.max(1, Math.max(distance(points[0], points[9]), distance(points[5], points[17]), distance(points[0], points[12])));
  const scale = targetScale / currentScale;

  return points.map((point) => ({
    x: anchor.x + (point.x - anchor.x) * scale,
    y: anchor.y + (point.y - anchor.y) * scale,
  }));
}
