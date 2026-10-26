import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { addIcons } from 'ionicons';
import {
  barbellOutline,
  clipboardOutline,
  homeOutline,
  trendingUpOutline,
} from 'ionicons/icons';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

addIcons({
  'barbell-outline': barbellOutline,
  'clipboard-outline': clipboardOutline,
  'home-outline': homeOutline,
  'trending-up-outline': trendingUpOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideCharts(withDefaultRegisterables()),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
});
