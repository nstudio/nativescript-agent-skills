import { View } from '@nativescript/core';

export class DotsView extends View {
  createNativeView(): UIView {
    const v = UIView.new();
    v.backgroundColor = UIColor.blackColor;
    return v;
  }
}
