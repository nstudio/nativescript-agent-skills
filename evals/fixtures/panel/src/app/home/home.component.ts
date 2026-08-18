import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { AppStore } from '../state/app.store';
import { PanelComponent } from '../panel/panel.component';

@Component({
  selector: 'ns-home',
  templateUrl: './home.component.html',
  imports: [NativeScriptCommonModule, PanelComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class HomeComponent {
  readonly store = inject(AppStore);
}
