import { View } from '@nativescript/core';

export class SceneView extends View {
  private scene = SCNScene.scene();

  createNativeView(): SCNView {
    const v = SCNView.alloc().initWithFrameOptions(CGRectZero, null);
    v.backgroundColor = UIColor.blackColor;
    v.scene = this.scene;
    return v;
  }
}

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const a = CLLocation.alloc().initWithLatitudeLongitude(aLat, aLon);
  const b = CLLocation.alloc().initWithLatitudeLongitude(bLat, bLon);
  return a.distanceFromLocation(b);
}
