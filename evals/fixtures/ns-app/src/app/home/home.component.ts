import { Component, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';

@Component({
  selector: 'ns-home',
  templateUrl: './home.component.html',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class HomeComponent {
  readonly title = signal('Overview');
}
