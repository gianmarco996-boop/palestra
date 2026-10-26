import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import {
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import {
  workoutSetVolume,
  WorkoutSession,
  WorkoutSet,
} from '../../models/workout.model';
import { WorkoutDataService } from '../../services/workout-data.service';

interface ExerciseSummary {
  id: string;
  name: string;
  sets: WorkoutSet[];
}

interface DaySummary {
  day: number | null;
  name: string;
  sessions: WorkoutSession[];
}

interface WeekSummary {
  week: number | null;
  label: string;
  days: DaySummary[];
  sessionCount: number;
}

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
  ],
})
export class HomePage {
  private readonly workoutData = inject(WorkoutDataService);
  sessions = signal(this.workoutData.getSessions());

  constructor() {
    effect(() => {
      this.workoutData.dataVersion();
      this.sessions.set(this.workoutData.getSessions());
    });
  }

  get workoutWeeks(): WeekSummary[] {
    const weeks = new Map<number | null, Map<number | null, WorkoutSession[]>>();
    for (const session of this.sessions()) {
      if (session.status !== 'completed') {
        continue;
      }
      const match = /Settimana\s+(\d+)\s*[·-]\s*Giorno\s+(\d+)/i.exec(session.name);
      const week = match ? Number(match[1]) : null;
      const day = match ? Number(match[2]) : null;
      const days = weeks.get(week) ?? new Map<number | null, WorkoutSession[]>();
      const sessions = days.get(day) ?? [];
      sessions.push(session);
      days.set(day, sessions);
      weeks.set(week, days);
    }

    return [...weeks.entries()]
      .sort(([first], [second]) => {
        if (first === null) {
          return 1;
        }
        if (second === null) {
          return -1;
        }
        return first - second;
      })
      .map(([week, days]) => ({
        week,
        label: week === null ? 'Altri allenamenti' : `Settimana ${week}`,
        sessionCount: [...days.values()].reduce(
          (count, sessions) => count + sessions.length,
          0,
        ),
        days: [...days.entries()]
          .sort(([first], [second]) => {
            if (first === null) {
              return 1;
            }
            if (second === null) {
              return -1;
            }
            return first - second;
          })
          .map(([day, sessions]) => ({
            day,
            name: day === null ? sessions[0].name : `Giorno ${day}`,
            sessions,
          })),
      }));
  }

  ionViewWillEnter(): void {
    this.sessions.set(this.workoutData.getSessions());
  }

  sessionDate(session: WorkoutSession): string {
    return new Date(session.startedAt).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  sessionVolume(session: WorkoutSession): number {
    return session.sets.reduce((volume, set) => volume + workoutSetVolume(set), 0);
  }

  sessionExercises(session: WorkoutSession): ExerciseSummary[] {
    const groups = new Map<string, ExerciseSummary>();
    for (const set of session.sets) {
      const id = set.templateExerciseId ?? set.exerciseId;
      const group = groups.get(id) ?? {
        id,
        name: set.exerciseName,
        sets: [],
      };
      group.sets.push(set);
      groups.set(id, group);
    }
    return [...groups.values()];
  }
}
