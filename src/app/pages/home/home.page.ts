import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { WorkoutDataService } from '../../services/workout-data.service';

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader, IonCardContent, IonButton, IonBadge, IonList, IonItem, IonLabel, IonIcon],
  providers: [DatePipe],
})
export class HomePage {
  private readonly workoutData = inject(WorkoutDataService);
  private readonly router = inject(Router);

  readonly sessions = this.workoutData.getSessions();
  readonly templates = this.workoutData.getTemplates();
  readonly exercises = this.workoutData.getExercises();

  get latestSession() {
    return this.sessions[0];
  }

  get completedSessionsThisWeek() {
    return this.sessions.length;
  }

  get totalVolume() {
    return this.latestSession?.sets.reduce((sum, set) => sum + ((set.weightKg ?? 0) * (set.reps ?? 0)), 0) ?? 0;
  }

  goToWorkout(): void {
    this.router.navigateByUrl('/workout');
  }
}
