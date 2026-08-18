import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly mode = signal<'earth' | 'lookup'>('earth');
  setModeIndex(i: number) { this.mode.set(i === 0 ? 'earth' : 'lookup'); }
}
