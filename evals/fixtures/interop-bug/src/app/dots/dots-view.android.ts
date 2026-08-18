import { View } from '@nativescript/core';

export class DotsView extends View {
  private px = new Float32Array(2000);
  private py = new Float32Array(2000);
  private readonly paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
  private frameCallback: android.view.Choreographer.FrameCallback | null = null;

  createNativeView(): android.view.View {
    const owner = this;

    @NativeClass()
    class DotsSurface extends android.view.View {
      constructor(ctx: android.content.Context) {
        super(ctx);
        return global.__native(this);
      }
      onDraw(canvas: android.graphics.Canvas) {
        super.onDraw(canvas);
        owner.paintFrame(canvas, this.getWidth(), this.getHeight());
      }
    }

    const v = new DotsSurface(this._context);
    v.setBackgroundColor(android.graphics.Color.BLACK);
    return v;
  }

  initNativeView() {
    super.initNativeView();
    for (let i = 0; i < 2000; i++) { this.px[i] = Math.random(); this.py[i] = Math.random(); }
    const ch = android.view.Choreographer.getInstance();
    this.frameCallback = new android.view.Choreographer.FrameCallback({
      doFrame: () => {
        if (!this.frameCallback) return;
        for (let i = 0; i < 2000; i++) { this.px[i] = (this.px[i] + 0.001) % 1; }
        (this.nativeViewProtected as android.view.View).postInvalidateOnAnimation();
        ch.postFrameCallback(this.frameCallback);
      },
    });
    ch.postFrameCallback(this.frameCallback);
  }

  disposeNativeView() {
    if (this.frameCallback) android.view.Choreographer.getInstance().removeFrameCallback(this.frameCallback);
    this.frameCallback = null;
    super.disposeNativeView();
  }

  paintFrame(canvas: android.graphics.Canvas, w: number, h: number) {
    const p = this.paint;
    p.setStyle(android.graphics.Paint.Style.FILL);
    p.setShader(new android.graphics.RadialGradient(
      w / 2, h / 2, w * 0.4,
      [android.graphics.Color.argb(255, 34, 88, 178), android.graphics.Color.argb(255, 6, 22, 64)],
      [0, 1],
      android.graphics.Shader.TileMode.CLAMP,
    ));
    canvas.drawCircle(w / 2, h / 2, w * 0.4, p);
    p.setShader(null);

    const xy = new Float32Array(4000);
    for (let i = 0; i < 2000; i++) { xy[i * 2] = this.px[i] * w; xy[i * 2 + 1] = this.py[i] * h; }
    p.setColor(android.graphics.Color.WHITE);
    p.setStrokeWidth(4);
    p.setStrokeCap(android.graphics.Paint.Cap.ROUND);
    canvas.drawPoints(xy, p);
  }
}
