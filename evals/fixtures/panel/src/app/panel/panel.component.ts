import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { AppStore } from '../state/app.store';

@Component({
  selector: 'ns-panel',
  templateUrl: './panel.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class PanelComponent {
  readonly store = inject(AppStore);
  readonly items = Array.from({ length: 12 }, (_, i) => `Pass ${i + 1}`);
}
