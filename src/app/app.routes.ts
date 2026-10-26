import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'templates',
        loadComponent: () => import('./pages/templates/templates.page').then((m) => m.TemplatesPage),
      },
      {
        path: 'workout',
        loadComponent: () => import('./pages/workout/workout.page').then((m) => m.WorkoutPage),
      },
      {
        path: 'progress',
        loadComponent: () => import('./pages/progress/progress.page').then((m) => m.ProgressPage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
];
