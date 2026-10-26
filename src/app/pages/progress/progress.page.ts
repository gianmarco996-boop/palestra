import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import {
  BaseChartDirective,
  provideCharts,
  withDefaultRegisterables,
} from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import {
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonContent,
  IonHeader,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { WorkoutSession, workoutSetVolume } from '../../models/workout.model';
import { WorkoutDataService } from '../../services/workout-data.service';

type ProgressPeriod = 'day' | 'week' | 'month';

@Component({
  selector: 'app-progress-page',
  templateUrl: './progress.page.html',
  styleUrls: ['./progress.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    BaseChartDirective,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonButton,
    IonList,
  ],
  providers: [provideCharts(withDefaultRegisterables())],
})
export class ProgressPage {
  private readonly workoutData = inject(WorkoutDataService);
  private readonly alertController = inject(AlertController);
  private readonly cdr = inject(ChangeDetectorRef);

  period: ProgressPeriod = 'day';
  sessions: WorkoutSession[] = this.workoutData.getSessions();
  chartData: ChartConfiguration<'line'>['data'] = this.createChartData();

  readonly chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#F5F5F5' },
      },
    },
    scales: {
      x: {
        ticks: { color: '#A5A7AE' },
        grid: { color: 'rgba(255,255,255,0.08)' },
      },
      y: {
        ticks: { color: '#A5A7AE' },
        grid: { color: 'rgba(255,255,255,0.08)' },
      },
    },
  };

  get periodSessions(): WorkoutSession[] {
    const { start, end } = this.getPeriodBounds();

    return this.sessions
      .filter((session) => {
        const timestamp = new Date(
          session.finishedAt ?? session.startedAt,
        ).getTime();

        return (
          session.status === 'completed' &&
          timestamp >= start.getTime() &&
          timestamp < end.getTime()
        );
      })
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
  }

  get completedSessions(): WorkoutSession[] {
    return this.sessions
      .filter((session) => session.status === 'completed')
      .sort(
        (a, b) =>
          new Date(b.finishedAt ?? b.startedAt).getTime() -
          new Date(a.finishedAt ?? a.startedAt).getTime(),
      );
  }

  get recordedWorkouts(): number {
    return this.periodSessions.length;
  }

  get totalSets(): number {
    return this.periodSessions.reduce(
      (total, session) => total + session.sets.length,
      0,
    );
  }

  get totalVolume(): number {
    return this.periodSessions.reduce(
      (total, session) =>
        total +
        session.sets.reduce((volume, set) => volume + workoutSetVolume(set), 0),
      0,
    );
  }

  get periodTitle(): string {
    switch (this.period) {
      case 'day':
        return 'Oggi';
      case 'week':
        return 'Questa settimana';
      case 'month':
        return 'Questo mese';
    }
  }

  ionViewWillEnter(): void {
    this.refreshData();
  }

  changePeriod(value: string | number | undefined): void {
    if (value !== 'day' && value !== 'week' && value !== 'month') {
      return;
    }

    this.period = value;
    this.chartData = this.createChartData();
    this.cdr.detectChanges();
  }

  sessionVolume(session: WorkoutSession): number {
    return session.sets.reduce(
      (volume, set) => volume + workoutSetVolume(set),
      0,
    );
  }

  sessionDate(session: WorkoutSession): string {
    return new Date(session.startedAt).toLocaleString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async deleteWorkout(session: WorkoutSession): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminare l’allenamento?',
      message: `“${session.name}” e le sue serie verranno rimossi definitivamente.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: () => {
            try {
              this.workoutData.deleteWorkout(session.id);
              this.refreshData();
              this.cdr.detectChanges();
            } catch (error) {
              void this.showError(error);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  private refreshData(): void {
    this.sessions = this.workoutData.getSessions();
    this.chartData = this.createChartData();
    this.cdr.detectChanges();
  }

  private getPeriodBounds(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);

    if (this.period === 'day') {
      end.setDate(end.getDate() + 1);
    } else if (this.period === 'week') {
      const daysSinceMonday = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - daysSinceMonday);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else {
      start.setDate(1);
      end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
    }

    return { start, end };
  }

  private createChartData(): ChartConfiguration<'line'>['data'] {
    const sets = this.periodSessions
      .flatMap((session) =>
        session.sets.flatMap((set) => {
          const loads = set.segments?.length
            ? set.segments.map((segment) => segment.weightKg)
            : [set.weightKg ?? 0];
          return loads
            .filter((weight) => weight > 0)
            .map((weight) => ({
              date: new Date(
                session.finishedAt ?? session.startedAt,
              ).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'short',
              }),
              weight,
            }));
        }),
      )
      .reverse();

    return {
      labels: sets.map((set) => set.date),
      datasets: [
        {
          label: 'Carico registrato (kg)',
          data: sets.map((set) => set.weight),
          borderColor: '#FFD166',
          backgroundColor: 'rgba(255, 209, 102, 0.2)',
          pointBackgroundColor: '#F5F5F5',
          pointBorderColor: '#FFD166',
          tension: 0.35,
        },
      ],
    };
  }

  private async showError(error: unknown): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Impossibile eliminare',
      message:
        error instanceof Error ? error.message : 'Si è verificato un errore.',
      buttons: ['OK'],
    });

    await alert.present();
  }
}
